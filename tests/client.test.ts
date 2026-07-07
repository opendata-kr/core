import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "../src/client.js";
import { DataGoKrError } from "../src/errors.js";

const fx = (n: string) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${n}`, import.meta.url)), "utf8");

function mockFetch(body: string, ok = true, status = 200) {
  return vi.fn(async () => new Response(body, { status: ok ? status : status }));
}

const base = { path: "/1230000/ad/BidPublicInfoService", serviceKey: "KEY" };

describe("createClient.call", () => {
  it("URL에 serviceKey(소문자)·path·operation·병합 params가 들어간다", async () => {
    const fetchFn = mockFetch(fx("search-cnstwk.json"));
    const client = createClient({ ...base, params: { type: "json" }, fetch: fetchFn });
    await client.call("getBidPblancListInfoCnstwk", { pageNo: 1 });
    const url = new URL((fetchFn.mock.calls[0]![0]) as string);
    expect(url.origin + url.pathname).toBe(
      "https://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfoCnstwk",
    );
    expect(url.searchParams.get("serviceKey")).toBe("KEY");
    expect(url.searchParams.get("type")).toBe("json");
    expect(url.searchParams.get("pageNo")).toBe("1");
  });

  it("정상 응답을 OperationResult로 정규화한다", async () => {
    const client = createClient({ ...base, fetch: mockFetch(fx("search-cnstwk.json")) });
    const r = await client.call("op", {});
    expect(r.totalCount).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(r.items)).toBe(true);
  });

  it("noData(03)는 빈 items", async () => {
    const client = createClient({ ...base, fetch: mockFetch(fx("no-data.json")) });
    const r = await client.call("op", {});
    expect(r.items).toEqual([]);
  });

  it("오류 resultCode는 DataGoKrError throw", async () => {
    const body = JSON.stringify({
      response: { header: { resultCode: "30", resultMsg: "SERVICE_KEY_IS_NOT_REGISTERED_ERROR" } },
    });
    const client = createClient({ ...base, fetch: mockFetch(body) });
    await expect(client.call("op", {})).rejects.toBeInstanceOf(DataGoKrError);
  });

  it("비-JSON XML 봉투의 returnReasonCode를 처리한다", async () => {
    const xml = "<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>30</returnReasonCode><returnAuthMsg>NOT_REGISTERED</returnAuthMsg></cmmMsgHeader></OpenAPI_ServiceResponse>";
    const client = createClient({ ...base, fetch: mockFetch(xml) });
    await expect(client.call("op", {})).rejects.toMatchObject({ code: "30" });
  });

  it("HTTP 오류는 throw", async () => {
    const client = createClient({ ...base, fetch: mockFetch("", false, 500) });
    await expect(client.call("op", {})).rejects.toThrow(/HTTP 500/);
  });

  it("serviceKeyLooksPreEncoded 플래그를 노출한다", () => {
    const client = createClient({ ...base, serviceKey: "a%2Bb", fetch: mockFetch("{}") });
    expect(client.serviceKeyLooksPreEncoded).toBe(true);
  });

  it("call-level params의 serviceKey는 인스턴스 serviceKey를 덮어쓸 수 없다", async () => {
    const fetchFn = mockFetch(fx("search-cnstwk.json"));
    const client = createClient({ ...base, serviceKey: "REAL", fetch: fetchFn });
    await client.call("op", { serviceKey: "EVIL" });
    const url = new URL(fetchFn.mock.calls[0]![0] as string);
    expect(url.searchParams.get("serviceKey")).toBe("REAL");
  });

  it("operation 앞뒤 슬래시를 모두 제거한다", async () => {
    const fetchFn = mockFetch(fx("search-cnstwk.json"));
    const client = createClient({ ...base, fetch: fetchFn });
    await client.call("/op/", {});
    const url = new URL(fetchFn.mock.calls[0]![0] as string);
    expect(url.pathname).toBe("/1230000/ad/BidPublicInfoService/op");
  });

  it("비-JSON noData 응답의 pageNo는 병합된 인스턴스 기본값을 사용한다", async () => {
    const xml =
      "<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>03</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>";
    const client = createClient({ ...base, params: { pageNo: 7 }, fetch: mockFetch(xml) });
    const r = await client.call("op", {});
    expect(r.pageNo).toBe(7);
  });
});

const okJson = (items: unknown[]) =>
  new Response(JSON.stringify({ response: { header: { resultCode: "00" }, body: { totalCount: items.length, pageNo: 1, items } } }), { status: 200 });

describe("client 재시도", () => {
  it("503은 1회 재시도 후 성공", async () => {
    const calls: number[] = [];
    let n = 0;
    const fetchFn = (async () => { n++; calls.push(n); return n === 1 ? new Response("x", { status: 503 }) : okJson([{ a: "1" }]); }) as unknown as typeof fetch;
    const client = createClient({ path: "/p/S", fetch: fetchFn, serviceKey: "k", retry: { sleep: async () => {} } });
    const r = await client.call("op");
    expect(r.items).toHaveLength(1);
    expect(n).toBe(2);
  });

  it("400은 재시도 없이 즉시 실패(httpStatus 보존)", async () => {
    let n = 0;
    const fetchFn = (async () => { n++; return new Response("bad", { status: 400 }); }) as unknown as typeof fetch;
    const client = createClient({ path: "/p/S", fetch: fetchFn, serviceKey: "k", retry: { sleep: async () => {} } });
    await expect(client.call("op")).rejects.toMatchObject({ httpStatus: 400 });
    expect(n).toBe(1);
  });

  it("타임아웃 후 성공하면 재시도로 복구", async () => {
    let n = 0;
    const fetchFn = (async () => { n++; if (n === 1) { const e: any = new Error("aborted"); e.name = "AbortError"; throw e; } return okJson([{ a: "1" }]); }) as unknown as typeof fetch;
    const client = createClient({ path: "/p/S", fetch: fetchFn, serviceKey: "k", retry: { sleep: async () => {} } });
    const r = await client.call("op");
    expect(r.items).toHaveLength(1);
    expect(n).toBe(2);
  });

  it("retries:0이면 재시도 안 함", async () => {
    let n = 0;
    const fetchFn = (async () => { n++; return new Response("x", { status: 503 }); }) as unknown as typeof fetch;
    const client = createClient({ path: "/p/S", fetch: fetchFn, serviceKey: "k", retry: { retries: 0, sleep: async () => {} } });
    await expect(client.call("op")).rejects.toBeInstanceOf(DataGoKrError);
    expect(n).toBe(1);
  });
});
