import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { create } from "../src/client.js";
import type { EnvelopeResponse } from "../src/interceptors.js";
import type { StandardSchemaV1 } from "../src/standardSchema.js";

const base = { baseURL: "https://apis.data.go.kr/1230000/ad/S", serviceKey: "KEY" };

const bodyWith = (items: unknown[]) =>
  JSON.stringify({
    response: {
      header: { resultCode: "00" },
      body: { totalCount: items.length, pageNo: 1, items },
    },
  });

function mockFetch(body: string, status = 200) {
  return vi.fn(async () => new Response(body, { status }));
}

// n을 문자열로 받아 숫자로 강제하는 스키마. 파싱 전(문자열)과 후(숫자)를 구분하는 표지로 쓴다.
const coerceSchema = z.looseObject({ n: z.coerce.number() });

describe("get 파이프라인 인터셉터 통합 (AC-6)", () => {
  it("request 인터셉터가 등록순으로 실행되고 변형이 실제 URL에 반영된다", async () => {
    const fetchFn = mockFetch(bodyWith([]));
    const client = create({ ...base, fetch: fetchFn });
    client.interceptors.request.use((ctx) => ({
      ...ctx,
      params: { ...ctx.params, added: "첫째" },
    }));
    client.interceptors.request.use((ctx) => ({
      ...ctx,
      params: { ...ctx.params, chained: `${String(ctx.params.added)}→둘째` },
    }));
    await client.get("op");
    const url = new URL(fetchFn.mock.calls[0]![0] as string);
    expect(url.searchParams.get("added")).toBe("첫째");
    expect(url.searchParams.get("chained")).toBe("첫째→둘째");
  });

  it("response onFulfilled는 스키마 파싱 전 값을 받고, 반환값이 파싱 입력이 된다", async () => {
    const client = create({ ...base, fetch: mockFetch(bodyWith([{ n: "1" }])) });
    const seen: unknown[] = [];
    client.interceptors.response.use((res) => {
      seen.push(res.data[0]);
      // 파싱 전 shape을 변형해 다음 단계(파싱)로 전달한다.
      return { ...res, data: [...res.data, { n: "2" }] };
    });
    const r = await client.get("op", { schema: coerceSchema });
    // 인터셉터 시점에는 coerce 전 문자열이다.
    expect(seen[0]).toEqual({ n: "1" });
    // 인터셉터가 추가한 item까지 스키마 파싱(coerce)을 거쳐 도착한다.
    expect(r.data.map((i) => i.n)).toEqual([1, 2]);
  });

  it("response onFulfilled도 등록순으로 실행되고 반환값이 전파된다", async () => {
    const client = create({ ...base, fetch: mockFetch(bodyWith([])) });
    client.interceptors.response.use((res) => ({ ...res, totalCount: res.totalCount + 1 }));
    client.interceptors.response.use((res) => ({ ...res, totalCount: res.totalCount * 10 }));
    const r = await client.get("op");
    // (0 + 1) * 10 = 10: 등록순이 뒤집히면 0 * 10 + 1 = 1이 된다.
    expect(r.totalCount).toBe(10);
  });

  it("eject(id) 이후에는 실행되지 않는다", async () => {
    const fetchFn = mockFetch(bodyWith([]));
    const client = create({ ...base, fetch: fetchFn });
    const reqSpy = vi.fn((ctx: { op: string; params: Record<string, unknown> }) => undefined);
    const resSpy = vi.fn(() => undefined);
    const reqId = client.interceptors.request.use(reqSpy as never);
    const resId = client.interceptors.response.use(resSpy);
    client.interceptors.request.eject(reqId);
    client.interceptors.response.eject(resId);
    await client.get("op");
    expect(reqSpy).not.toHaveBeenCalled();
    expect(resSpy).not.toHaveBeenCalled();
  });

  it("onRejected 회복 값은 스키마 파싱을 거쳐 호출자에 resolve된다 (회복 재진입)", async () => {
    const client = create({
      ...base,
      fetch: mockFetch("", 500),
      retry: { retries: 0, sleep: async () => {} },
    });
    const recovered: EnvelopeResponse = {
      data: [{ n: "5" }],
      totalCount: 1,
      pageNo: 1,
      invalid: [],
    };
    client.interceptors.response.use(undefined, () => recovered);
    const r = await client.get("op", { schema: coerceSchema });
    // 회복 값(파싱 전 shape)이 coerce를 거쳐 숫자로 도착 = 파싱 단계부터 재진입했다.
    expect(r.data).toEqual([{ n: 5 }]);
  });

  it("onRejected가 재던지면 호출자로 전파된다", async () => {
    const client = create({
      ...base,
      fetch: mockFetch("", 500),
      retry: { retries: 0, sleep: async () => {} },
    });
    client.interceptors.response.use(undefined, () => {
      throw new Error("변환된 에러");
    });
    await expect(client.get("op")).rejects.toThrow("변환된 에러");
  });

  it("회복 재진입 후의 파싱 throw는 직행 전파된다 (체인 재무장 없음, 회복 루프 불가)", async () => {
    const boom = new Error("스키마 구현 결함");
    const throwing: StandardSchemaV1<unknown, { n: number }> = {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: () => {
          throw boom;
        },
      },
    };
    const client = create({
      ...base,
      fetch: mockFetch("", 500),
      retry: { retries: 0, sleep: async () => {} },
    });
    const onRejected = vi.fn(
      (): EnvelopeResponse => ({ data: [{ n: "1" }], totalCount: 1, pageNo: 1, invalid: [] }),
    );
    client.interceptors.response.use(undefined, onRejected);
    await expect(client.get("op", { schema: throwing })).rejects.toBe(boom);
    // 파싱 throw가 다시 onRejected로 돌아가지 않았다 = 회복 루프 불가.
    expect(onRejected).toHaveBeenCalledTimes(1);
  });
});
