import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { create } from "../src/client.js";

// create()는 process.env를 읽으므로 env 3종을 격리해 우선순위를 검증한다 (AC-8).
const KEYS = ["DATA_GO_KR_SERVICE_KEY", "DATA_GO_KR_BASE_URL", "DATA_GO_KR_TIMEOUT_MS"] as const;
let saved: Partial<Record<(typeof KEYS)[number], string | undefined>>;

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of KEYS) {
    const v = saved[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const okBody = JSON.stringify({
  response: { header: { resultCode: "00" }, body: { totalCount: 0, pageNo: 1, items: [] } },
});

describe("create env 해석", () => {
  it("옵션이 없으면 env의 serviceKey·baseURL을 쓴다", async () => {
    process.env.DATA_GO_KR_SERVICE_KEY = "ENVKEY";
    process.env.DATA_GO_KR_BASE_URL = "https://apis.data.go.kr/1230000/ad/S";
    const fetchFn = vi.fn(async () => new Response(okBody, { status: 200 }));
    const client = create({ fetch: fetchFn as unknown as typeof fetch });
    await client.get("op");
    const url = new URL(fetchFn.mock.calls[0]![0] as string);
    expect(url.origin + url.pathname).toBe("https://apis.data.go.kr/1230000/ad/S/op");
    expect(url.searchParams.get("serviceKey")).toBe("ENVKEY");
  });

  it("옵션 serviceKey·baseURL이 env를 이긴다", async () => {
    process.env.DATA_GO_KR_SERVICE_KEY = "ENVKEY";
    process.env.DATA_GO_KR_BASE_URL = "https://envhost/x";
    const fetchFn = vi.fn(async () => new Response(okBody, { status: 200 }));
    const client = create({
      baseURL: "https://opthost/y",
      serviceKey: "OPTKEY",
      fetch: fetchFn as unknown as typeof fetch,
    });
    await client.get("op");
    const url = new URL(fetchFn.mock.calls[0]![0] as string);
    expect(url.origin + url.pathname).toBe("https://opthost/y/op");
    expect(url.searchParams.get("serviceKey")).toBe("OPTKEY");
  });

  it("DATA_GO_KR_TIMEOUT_MS가 옵션 timeout을 이긴다 (타임아웃 에러 메시지로 확인)", async () => {
    process.env.DATA_GO_KR_TIMEOUT_MS = "45000";
    const abortingFetch = (async () => {
      const e = new Error("aborted");
      e.name = "AbortError";
      throw e;
    }) as unknown as typeof fetch;
    const client = create({
      baseURL: "https://apis.data.go.kr/1230000/ad/S",
      serviceKey: "K",
      timeout: 5000,
      fetch: abortingFetch,
      retry: { retries: 0, sleep: async () => {} },
    });
    await expect(client.get("op")).rejects.toThrow(/45000ms/);
  });

  it("baseURL이 옵션에도 env에도 없으면 create가 즉시 던진다", () => {
    process.env.DATA_GO_KR_SERVICE_KEY = "K";
    expect(() => create()).toThrow(/DATA_GO_KR_BASE_URL/);
  });

  it("serviceKey가 옵션에도 env에도 없으면 create가 즉시 던진다", () => {
    expect(() => create({ baseURL: "https://apis.data.go.kr/1230000/ad/S" })).toThrow(
      /DATA_GO_KR_SERVICE_KEY/,
    );
  });
});
