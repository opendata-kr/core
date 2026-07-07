import { describe, it, expect } from "vitest";
import { fetchWindows } from "../src/fetchWindows.js";
import type { OperationResult } from "../src/envelope.js";

const win = (bgn: string, end: string) => ({ bgn, end });

describe("fetchWindows", () => {
  it("성공 창을 합치고 totalCount 누적", async () => {
    const call = async (_op: string, p: Record<string, unknown>): Promise<OperationResult> => ({
      totalCount: 1, pageNo: 1, items: [{ w: String(p.inqryBgnDt) }],
    });
    const r = await fetchWindows(call, "op", {}, [win("A0000", "A2359"), win("B0000", "B2359")], { pageSize: 10, maxPages: 3, concurrency: 2 });
    expect(r.items.map((i) => i.w)).toEqual(["A0000", "B0000"]);
    expect(r.totalCount).toBe(2);
    expect(r.failedWindows).toHaveLength(0);
  });

  it("실패 창은 failedWindows에 보존하고 성공 창은 반환", async () => {
    const call = async (_op: string, p: Record<string, unknown>): Promise<OperationResult> => {
      if (p.inqryBgnDt === "B0000") throw new Error("throttle");
      return { totalCount: 1, pageNo: 1, items: [{ w: String(p.inqryBgnDt) }] };
    };
    const r = await fetchWindows(call, "op", {}, [win("A0000", "A2359"), win("B0000", "B2359")], { pageSize: 10, maxPages: 3, concurrency: 2 });
    expect(r.items.map((i) => i.w)).toEqual(["A0000"]);
    expect(r.failedWindows).toEqual([{ window: win("B0000", "B2359"), error: "throttle" }]);
  });
});
