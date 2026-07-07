import { describe, it, expect } from "vitest";
import { mapWithConcurrency } from "../src/concurrency.js";

describe("mapWithConcurrency", () => {
  it("결과를 입력 순서로 보존", async () => {
    const r = await mapWithConcurrency([1, 2, 3], 2, async (n) => n * 10);
    expect(r.map((s) => (s.status === "fulfilled" ? s.value : null))).toEqual([10, 20, 30]);
  });

  it("동시 실행이 limit을 넘지 않음", async () => {
    let active = 0, peak = 0;
    await mapWithConcurrency([1, 2, 3, 4, 5], 2, async () => {
      active++; peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
    });
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("실패를 격리하고 나머지는 성공", async () => {
    const r = await mapWithConcurrency([1, 2, 3], 3, async (n) => { if (n === 2) throw new Error("boom"); return n; });
    expect(r[0]).toEqual({ status: "fulfilled", value: 1 });
    expect(r[1]!.status).toBe("rejected");
    expect(r[2]).toEqual({ status: "fulfilled", value: 3 });
  });
});
