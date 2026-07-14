import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { create } from "../src/client.js";

const base = { baseURL: "https://apis.data.go.kr/1230000/ad/S", serviceKey: "KEY" };

// pageNo → items 배열 맵으로 페이지 응답을 흉내낸다. totalCount는 전 페이지 공통 보고값.
function pagedFetch(totalCount: number, pages: Record<number, unknown[]>) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const pageNo = Number(url.searchParams.get("pageNo"));
    const items = pages[pageNo] ?? [];
    return new Response(
      JSON.stringify({
        response: { header: { resultCode: "00" }, body: { totalCount, pageNo, items } },
      }),
      { status: 200 },
    );
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe("client.paginate", () => {
  it("totalCount까지 페이지를 소진해 합친다", async () => {
    const fetchFn = pagedFetch(3, { 1: [{ a: "1" }, { a: "2" }], 2: [{ a: "3" }] });
    const client = create({ ...base, fetch: fetchFn });
    const r = await client.paginate("op", { pageSize: 2, maxPages: 10 });
    expect(r.data.map((i) => i.a)).toEqual(["1", "2", "3"]);
    expect(r.totalCount).toBe(3);
    expect(r.truncated).toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("maxPages 초과 시 truncated=true", async () => {
    const fetchFn = pagedFetch(100, { 1: [{ a: "x" }], 2: [{ a: "x" }], 3: [{ a: "x" }] });
    const client = create({ ...base, fetch: fetchFn });
    const r = await client.paginate("op", { pageSize: 1, maxPages: 2 });
    expect(r.data).toHaveLength(2);
    expect(r.truncated).toBe(true);
  });

  it("빈 페이지를 받으면 truncated 없이 종료한다", async () => {
    const fetchFn = pagedFetch(10, { 1: [{ a: "1" }], 2: [] });
    const client = create({ ...base, fetch: fetchFn });
    const r = await client.paginate("op", { pageSize: 1, maxPages: 10 });
    expect(r.data).toHaveLength(1);
    expect(r.truncated).toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  // AC-9: 종료 판정의 수신 item 수는 data + invalid 합산이다. 탈락(invalid)도 수신이므로
  // 전 페이지를 소진했으면 truncated=false로 끝나야 한다(합산이 아니면 무한히 다음 페이지를 청함).
  it("invalid 혼재 응답에서 종료 판정은 data+invalid 합산 기준이다", async () => {
    const schema = z.looseObject({ no: z.string() });
    const fetchFn = pagedFetch(4, {
      1: [{ no: "1" }, { no: 2 }], // no:2는 숫자라 탈락
      2: [{ no: 3 }, { no: "4" }], // no:3 탈락
    });
    const client = create({ ...base, fetch: fetchFn });
    const r = await client.paginate("op", { schema, pageSize: 2, maxPages: 10 });
    expect(r.data.map((i) => i.no)).toEqual(["1", "4"]);
    expect(r.invalid).toHaveLength(2);
    expect(r.truncated).toBe(false);
    expect(r.totalCount).toBe(4); // API 보고값 그대로
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  // AC-4: 다페이지 합산에서 invalid[].index는 이 호출이 수신한 전체 시퀀스의 누적 위치다.
  it("다페이지 invalid[].index가 누적 수신 위치를 가리킨다", async () => {
    const schema = z.looseObject({ no: z.string() });
    const fetchFn = pagedFetch(4, {
      1: [{ no: "1" }, { no: 2 }], // 수신 위치 0, 1 → 1이 탈락
      2: [{ no: 3 }, { no: "4" }], // 수신 위치 2, 3 → 2가 탈락
    });
    const client = create({ ...base, fetch: fetchFn });
    const r = await client.paginate("op", { schema, pageSize: 2, maxPages: 10 });
    expect(r.invalid.map((v) => v.index)).toEqual([1, 2]);
    expect(r.invalid[0]!.raw).toEqual({ no: 2 });
    expect(r.invalid[1]!.raw).toEqual({ no: 3 });
  });
});
