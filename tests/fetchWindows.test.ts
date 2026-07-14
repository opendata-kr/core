import { describe, it, expect } from "vitest";
import { z } from "zod";
import { create } from "../src/client.js";

const base = { baseURL: "https://apis.data.go.kr/1230000/ad/S", serviceKey: "KEY" };
const win = (bgn: string, end: string) => ({ bgn, end });

// inqryBgnDt 창별로 items(1페이지 완결)를 돌려주는 fetch. delayMs로 완료 순서를 뒤섞을 수 있다.
function windowedFetch(byBgn: Record<string, unknown[] | "fail">, delayMs: Record<string, number> = {}) {
  return (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const bgn = String(url.searchParams.get("inqryBgnDt"));
    const delay = delayMs[bgn] ?? 0;
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    const spec = byBgn[bgn];
    if (spec === "fail") return new Response("bad", { status: 400 });
    const items = spec ?? [];
    return new Response(
      JSON.stringify({
        response: {
          header: { resultCode: "00" },
          body: { totalCount: items.length, pageNo: 1, items },
        },
      }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;
}

const opts = { pageSize: 10, maxPages: 3, concurrency: 2 };

describe("client.paginateWindows", () => {
  it("성공 창을 합치고 totalCount 누적", async () => {
    const client = create({
      ...base,
      fetch: windowedFetch({ A0000: [{ w: "A0000" }], B0000: [{ w: "B0000" }] }),
    });
    const r = await client.paginateWindows("op", {
      windows: [win("A0000", "A2359"), win("B0000", "B2359")],
      ...opts,
    });
    expect(r.data.map((i) => i.w)).toEqual(["A0000", "B0000"]);
    expect(r.totalCount).toBe(2);
    expect(r.failedWindows).toHaveLength(0);
    expect(r.truncated).toBe(false);
  });

  it("실패 창은 failedWindows에 보존하고 성공 창은 반환", async () => {
    const client = create({
      ...base,
      fetch: windowedFetch({ A0000: [{ w: "A0000" }], B0000: "fail" }),
      retry: { sleep: async () => {} },
    });
    const r = await client.paginateWindows("op", {
      windows: [win("A0000", "A2359"), win("B0000", "B2359")],
      ...opts,
    });
    expect(r.data.map((i) => i.w)).toEqual(["A0000"]);
    expect(r.failedWindows).toHaveLength(1);
    expect(r.failedWindows[0]!.window).toEqual(win("B0000", "B2359"));
    expect(r.failedWindows[0]!.error).toMatch(/HTTP 400/);
  });

  // invalid 합산·index 재계산은 windows 배열 등록순 기준이다. A창을 지연시켜 B창이 먼저
  // 완료돼도 결과가 결정적(등록순)임을 증명한다.
  it("invalid 합산·index는 병렬 완료순이 아니라 windows 등록순으로 안정 처리한다", async () => {
    const schema = z.looseObject({ no: z.string() });
    const client = create({
      ...base,
      fetch: windowedFetch(
        {
          A0000: [{ no: "a1" }, { no: 2 }], // 등록순 수신 위치 0, 1 → 1이 탈락
          B0000: [{ no: 3 }, { no: "b2" }], // 등록순 수신 위치 2, 3 → 2가 탈락
        },
        { A0000: 30 }, // A창을 늦춰 B창이 먼저 끝나게 한다
      ),
    });
    const r = await client.paginateWindows("op", {
      schema,
      windows: [win("A0000", "A2359"), win("B0000", "B2359")],
      ...opts,
    });
    expect(r.data.map((i) => i.no)).toEqual(["a1", "b2"]);
    expect(r.invalid.map((v) => v.index)).toEqual([1, 2]);
    expect(r.invalid[0]!.raw).toEqual({ no: 2 });
    expect(r.invalid[1]!.raw).toEqual({ no: 3 });
  });
});
