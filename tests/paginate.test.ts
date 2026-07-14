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

  // 빈 페이지 종료는 정상 소진일 수도, 조용한 부분 결과(인터셉터 회복 빈 봉투·API 과대 보고)일
  // 수도 있다. 수신 합계가 totalCount 미만이면 부분 결과로 알린다.
  it("빈 페이지 종료인데 수신 합계가 totalCount 미만이면 truncated=true", async () => {
    const fetchFn = pagedFetch(10, { 1: [{ a: "1" }], 2: [] });
    const client = create({ ...base, fetch: fetchFn });
    const r = await client.paginate("op", { pageSize: 1, maxPages: 10 });
    expect(r.data).toHaveLength(1);
    expect(r.truncated).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("totalCount 0의 빈 첫 페이지는 truncated=false로 종료한다", async () => {
    const fetchFn = pagedFetch(0, { 1: [] });
    const client = create({ ...base, fetch: fetchFn });
    const r = await client.paginate("op", { pageSize: 10, maxPages: 10 });
    expect(r.data).toEqual([]);
    expect(r.truncated).toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  // noData 폴백 페이지는 totalCount를 0으로 보고한다. 이미 수신한 실측 totalCount를
  // 0으로 덮어쓰면 부분 결과가 truncated=false로 오보고되므로 기존 값을 유지해야 한다.
  it("데이터 수신 후의 totalCount 0 보고는 기존 totalCount를 덮어쓰지 않는다", async () => {
    const perPage: Record<number, { totalCount: number; items: unknown[] }> = {
      1: { totalCount: 4, items: [{ a: "1" }, { a: "2" }] },
      2: { totalCount: 0, items: [] }, // noData 폴백 흉내
    };
    const fetchFn = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const pageNo = Number(url.searchParams.get("pageNo"));
      const page = perPage[pageNo] ?? { totalCount: 0, items: [] };
      return new Response(
        JSON.stringify({
          response: {
            header: { resultCode: "00" },
            body: { totalCount: page.totalCount, pageNo, items: page.items },
          },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const client = create({ ...base, fetch: fetchFn });
    const r = await client.paginate("op", { pageSize: 2, maxPages: 10 });
    expect(r.data).toHaveLength(2);
    expect(r.totalCount).toBe(4); // 0으로 덮어쓰지 않는다
    expect(r.truncated).toBe(true); // 4건 중 2건만 수신한 부분 결과
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
