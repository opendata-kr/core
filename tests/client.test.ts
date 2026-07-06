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
});
