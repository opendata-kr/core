import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { create } from "../src/client.js";
import { DataGoKrError } from "../src/errors.js";

const fx = (n: string) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${n}`, import.meta.url)), "utf8");

function mockFetch(body: string, status = 200) {
  return vi.fn(async () => new Response(body, { status }));
}

// baseURL은 서비스 경로를 포함한 전체 URL이다 (구 path 옵션 대체).
const base = {
  baseURL: "https://apis.data.go.kr/1230000/ad/BidPublicInfoService",
  serviceKey: "KEY",
};

describe("client.get", () => {
  it("URL에 serviceKey(소문자)·baseURL 경로·operation·병합 params가 들어간다", async () => {
    const fetchFn = mockFetch(fx("search-cnstwk.json"));
    const client = create({ ...base, params: { type: "json" }, fetch: fetchFn });
    await client.get("getBidPblancListInfoCnstwk", { params: { pageNo: 1 } });
    const url = new URL(fetchFn.mock.calls[0]![0] as string);
    expect(url.origin + url.pathname).toBe(
      "https://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfoCnstwk",
    );
    expect(url.searchParams.get("serviceKey")).toBe("KEY");
    expect(url.searchParams.get("type")).toBe("json");
    expect(url.searchParams.get("pageNo")).toBe("1");
  });

  it("정상 응답을 DataGoKrResponse로 정규화한다 (schema 생략 시 invalid는 빈 배열)", async () => {
    const client = create({ ...base, fetch: mockFetch(fx("search-cnstwk.json")) });
    const r = await client.get("op");
    expect(r.totalCount).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(r.data)).toBe(true);
    expect(r.invalid).toEqual([]);
  });

  it("noData(03)는 빈 data", async () => {
    const client = create({ ...base, fetch: mockFetch(fx("no-data.json")) });
    const r = await client.get("op");
    expect(r.data).toEqual([]);
  });

  it("오류 resultCode는 DataGoKrError throw", async () => {
    const body = JSON.stringify({
      response: { header: { resultCode: "30", resultMsg: "SERVICE_KEY_IS_NOT_REGISTERED_ERROR" } },
    });
    const client = create({ ...base, fetch: mockFetch(body) });
    await expect(client.get("op")).rejects.toBeInstanceOf(DataGoKrError);
  });

  it("비-JSON XML 봉투의 returnReasonCode를 처리한다", async () => {
    const xml =
      "<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>30</returnReasonCode><returnAuthMsg>NOT_REGISTERED</returnAuthMsg></cmmMsgHeader></OpenAPI_ServiceResponse>";
    const client = create({ ...base, fetch: mockFetch(xml) });
    await expect(client.get("op")).rejects.toMatchObject({ code: "30" });
  });

  it("HTTP 오류는 throw", async () => {
    const client = create({ ...base, fetch: mockFetch("", 500), retry: { sleep: async () => {} } });
    await expect(client.get("op")).rejects.toThrow(/HTTP 500/);
  });

  it("serviceKeyLooksPreEncoded 플래그를 노출한다", () => {
    const client = create({ ...base, serviceKey: "a%2Bb", fetch: mockFetch("{}") });
    expect(client.serviceKeyLooksPreEncoded).toBe(true);
  });

  it("호출 레벨 params의 serviceKey는 인스턴스 serviceKey를 덮어쓸 수 없다", async () => {
    const fetchFn = mockFetch(fx("search-cnstwk.json"));
    const client = create({ ...base, serviceKey: "REAL", fetch: fetchFn });
    await client.get("op", { params: { serviceKey: "EVIL" } });
    const url = new URL(fetchFn.mock.calls[0]![0] as string);
    expect(url.searchParams.get("serviceKey")).toBe("REAL");
  });

  it("operation 앞뒤 슬래시를 모두 제거한다", async () => {
    const fetchFn = mockFetch(fx("search-cnstwk.json"));
    const client = create({ ...base, fetch: fetchFn });
    await client.get("/op/");
    const url = new URL(fetchFn.mock.calls[0]![0] as string);
    expect(url.pathname).toBe("/1230000/ad/BidPublicInfoService/op");
  });

  it("비-JSON noData 응답의 pageNo는 병합된 인스턴스 기본값을 사용한다", async () => {
    const xml =
      "<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>03</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>";
    const client = create({ ...base, params: { pageNo: 7 }, fetch: mockFetch(xml) });
    const r = await client.get("op");
    expect(r.pageNo).toBe(7);
  });
});

// 구 envelope.test.ts의 normalizeItems 변형 전수를 get 경유로 보존한다.
describe("client.get 봉투 정규화", () => {
  const bodyWith = (items: unknown) =>
    JSON.stringify({
      response: { header: { resultCode: "00" }, body: { totalCount: 1, pageNo: 1, items } },
    });

  it("배열 직접(조달청)", async () => {
    const client = create({ ...base, fetch: mockFetch(bodyWith([{ a: "1" }])) });
    expect((await client.get("op")).data).toEqual([{ a: "1" }]);
  });

  it("items.item 배열 중첩(기상청)", async () => {
    const client = create({ ...base, fetch: mockFetch(bodyWith({ item: [{ a: "1" }] })) });
    expect((await client.get("op")).data).toEqual([{ a: "1" }]);
  });

  it("items.item 단건 객체", async () => {
    const client = create({ ...base, fetch: mockFetch(bodyWith({ item: { a: "1" } })) });
    expect((await client.get("op")).data).toEqual([{ a: "1" }]);
  });

  it("빈 문자열", async () => {
    const client = create({ ...base, fetch: mockFetch(bodyWith("")) });
    expect((await client.get("op")).data).toEqual([]);
  });

  it("items 부재(undefined)", async () => {
    const body = JSON.stringify({
      response: { header: { resultCode: "00" }, body: { totalCount: 0, pageNo: 1 } },
    });
    const client = create({ ...base, fetch: mockFetch(body) });
    expect((await client.get("op")).data).toEqual([]);
  });
});

const okJson = (items: unknown[]) =>
  new Response(
    JSON.stringify({
      response: {
        header: { resultCode: "00" },
        body: { totalCount: items.length, pageNo: 1, items },
      },
    }),
    { status: 200 },
  );

// 본문 읽기(res.text())는 헤더 수신 후에도 오래 걸리거나 끊길 수 있다.
// 타임아웃·network 정규화가 본문 읽기 구간까지 적용됨을 검증한다.
describe("client 본문 읽기", () => {
  // env DATA_GO_KR_TIMEOUT_MS가 옵션 timeout을 이기므로, 짧은 타임아웃 테스트가
  // 외부 환경에 흔들리지 않게 이 블록에서만 격리한다.
  let savedTimeoutEnv: string | undefined;
  beforeEach(() => {
    savedTimeoutEnv = process.env.DATA_GO_KR_TIMEOUT_MS;
    delete process.env.DATA_GO_KR_TIMEOUT_MS;
  });
  afterEach(() => {
    if (savedTimeoutEnv === undefined) delete process.env.DATA_GO_KR_TIMEOUT_MS;
    else process.env.DATA_GO_KR_TIMEOUT_MS = savedTimeoutEnv;
  });

  // 헤더는 즉시 오고 본문이 영영 오지 않는 응답. text()는 abort 신호를 받아야만 거부된다.
  function hangingBodyFetch() {
    return (async (_input: string | URL | Request, init?: RequestInit) => {
      const signal = init?.signal as AbortSignal;
      return {
        ok: true,
        status: 200,
        text: () =>
          new Promise<string>((_, reject) => {
            const abort = () => {
              const e = new Error("aborted");
              e.name = "AbortError";
              reject(e);
            };
            if (signal.aborted) abort();
            else signal.addEventListener("abort", abort);
          }),
      } as unknown as Response;
    }) as unknown as typeof fetch;
  }

  // 본문이 오다가 끊기는 응답(소켓 단절). text()가 일반 예외로 거부된다.
  function brokenBodyResponse(): Response {
    return {
      ok: true,
      status: 200,
      text: async () => {
        throw new Error("socket hang up");
      },
    } as unknown as Response;
  }

  it("본문 읽기 중 타임아웃도 타임아웃 DataGoKrError로 정규화한다", async () => {
    const client = create({
      ...base,
      timeout: 20,
      fetch: hangingBodyFetch(),
      retry: { retries: 0, sleep: async () => {} },
    });
    await expect(client.get("op")).rejects.toThrow(/요청 시간 초과/);
  });

  it("본문 읽기 예외는 kind network의 DataGoKrError로 래핑된다", async () => {
    const fetchFn = (async () => brokenBodyResponse()) as unknown as typeof fetch;
    const client = create({ ...base, fetch: fetchFn, retry: { retries: 0, sleep: async () => {} } });
    await expect(client.get("op")).rejects.toMatchObject({
      name: "DataGoKrError",
      kind: "network",
    });
  });

  it("본문 읽기 예외는 network라 재시도 대상이다 (끊김 후 재시도로 복구)", async () => {
    let n = 0;
    const fetchFn = (async () => {
      n++;
      return n === 1 ? brokenBodyResponse() : okJson([{ a: "1" }]);
    }) as unknown as typeof fetch;
    const client = create({ ...base, fetch: fetchFn, retry: { sleep: async () => {} } });
    const r = await client.get("op");
    expect(r.data).toHaveLength(1);
    expect(n).toBe(2);
  });
});

describe("client 재시도", () => {
  it("503은 1회 재시도 후 성공", async () => {
    let n = 0;
    const fetchFn = (async () => {
      n++;
      return n === 1 ? new Response("x", { status: 503 }) : okJson([{ a: "1" }]);
    }) as unknown as typeof fetch;
    const client = create({ ...base, fetch: fetchFn, retry: { sleep: async () => {} } });
    const r = await client.get("op");
    expect(r.data).toHaveLength(1);
    expect(n).toBe(2);
  });

  it("400은 재시도 없이 즉시 실패(httpStatus 보존)", async () => {
    let n = 0;
    const fetchFn = (async () => {
      n++;
      return new Response("bad", { status: 400 });
    }) as unknown as typeof fetch;
    const client = create({ ...base, fetch: fetchFn, retry: { sleep: async () => {} } });
    await expect(client.get("op")).rejects.toMatchObject({ httpStatus: 400 });
    expect(n).toBe(1);
  });

  it("타임아웃 후 성공하면 재시도로 복구", async () => {
    let n = 0;
    const fetchFn = (async () => {
      n++;
      if (n === 1) {
        const e = new Error("aborted");
        e.name = "AbortError";
        throw e;
      }
      return okJson([{ a: "1" }]);
    }) as unknown as typeof fetch;
    const client = create({ ...base, fetch: fetchFn, retry: { sleep: async () => {} } });
    const r = await client.get("op");
    expect(r.data).toHaveLength(1);
    expect(n).toBe(2);
  });

  it("retries:0이면 재시도 안 함", async () => {
    let n = 0;
    const fetchFn = (async () => {
      n++;
      return new Response("x", { status: 503 });
    }) as unknown as typeof fetch;
    const client = create({ ...base, fetch: fetchFn, retry: { retries: 0, sleep: async () => {} } });
    await expect(client.get("op")).rejects.toBeInstanceOf(DataGoKrError);
    expect(n).toBe(1);
  });
});
