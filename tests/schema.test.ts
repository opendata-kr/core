import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { create } from "../src/client.js";
import type { StandardSchemaV1 } from "../src/standardSchema.js";

const base = { baseURL: "https://apis.data.go.kr/1230000/ad/S", serviceKey: "KEY" };

const bodyWith = (items: unknown[]) =>
  JSON.stringify({
    response: {
      header: { resultCode: "00" },
      body: { totalCount: items.length, pageNo: 1, items },
    },
  });

const mockFetch = (body: string) =>
  (async () => new Response(body, { status: 200 })) as unknown as typeof fetch;

const schema = z.looseObject({ no: z.string() });

describe("client.get 스키마 파싱 (정책 B: item 격리)", () => {
  // AC-4: 위반 1건 + 정상 N건에서 data는 정상분만, invalid는 index·issues·raw 보존, throw 없음.
  it("위반 item은 invalid로 격리하고 throw하지 않는다", async () => {
    const client = create({
      ...base,
      fetch: mockFetch(bodyWith([{ no: "1" }, { no: 2 }, { no: "3" }])),
    });
    const r = await client.get("op", { schema });
    expect(r.data.map((i) => i.no)).toEqual(["1", "3"]);
    expect(r.invalid).toHaveLength(1);
    expect(r.invalid[0]!.index).toBe(1);
    expect(r.invalid[0]!.raw).toEqual({ no: 2 });
    expect(r.invalid[0]!.issues.length).toBeGreaterThan(0);
    expect(typeof r.invalid[0]!.issues[0]).toBe("string");
    // issues 문자열화에 경로가 들어간다 (zod issue path = ["no"]).
    expect(r.invalid[0]!.issues[0]).toMatch(/no/);
  });

  it("looseObject라 미지 필드가 제거되지 않는다", async () => {
    const client = create({ ...base, fetch: mockFetch(bodyWith([{ no: "1", extra: "x" }])) });
    const r = await client.get("op", { schema });
    expect(r.data[0]).toEqual({ no: "1", extra: "x" });
  });

  it("schema 생략 시 data는 무검증 통과, invalid는 빈 배열", async () => {
    const client = create({ ...base, fetch: mockFetch(bodyWith([{ no: 2 }])) });
    const r = await client.get("op");
    expect(r.data).toEqual([{ no: 2 }]);
    expect(r.invalid).toEqual([]);
  });

  it("validate가 Promise를 반환하면 await한다", async () => {
    const asyncSchema: StandardSchemaV1<unknown, { no: string }> = {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: async (value) => {
          const v = value as { no: unknown };
          return typeof v.no === "string"
            ? { value: { no: v.no } }
            : { issues: [{ message: "no는 문자열이어야 함" }] };
        },
      },
    };
    const client = create({ ...base, fetch: mockFetch(bodyWith([{ no: "1" }, { no: 2 }])) });
    const r = await client.get("op", { schema: asyncSchema });
    expect(r.data).toEqual([{ no: "1" }]);
    expect(r.invalid[0]!.issues).toEqual(["no는 문자열이어야 함"]);
  });

  // validate 자체의 예외는 데이터 탈락이 아니라 스키마 구현 결함: 격리하지 않고 전파하며,
  // onRejected 체인(파싱 이전 단계 전용)도 경유하지 않는다.
  it("validate 예외는 onRejected 체인 없이 호출자로 직행 전파한다", async () => {
    const boom = new Error("스키마 구현 결함");
    const throwing: StandardSchemaV1<unknown, { no: string }> = {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: () => {
          throw boom;
        },
      },
    };
    const client = create({ ...base, fetch: mockFetch(bodyWith([{ no: "1" }])) });
    const onRejected = vi.fn((err: unknown) => {
      throw err;
    });
    client.interceptors.response.use(undefined, onRejected);
    await expect(client.get("op", { schema: throwing })).rejects.toBe(boom);
    expect(onRejected).not.toHaveBeenCalled();
  });
});
