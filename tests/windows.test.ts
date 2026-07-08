import { describe, it, expect } from "vitest";
import { splitCalendarMonths } from "../src/windows.js";

describe("splitCalendarMonths", () => {
  it("한 달 안이면 단일 창(00:00~23:59)", () => {
    expect(splitCalendarMonths("20260610", "20260620")).toEqual([
      { bgn: "202606100000", end: "202606202359" },
    ]);
  });
  it("여러 달을 월 경계로 분할하고 각 창은 같은 달에 머문다", () => {
    const w = splitCalendarMonths("20260101", "20260630");
    expect(w).toHaveLength(6);
    expect(w[0]).toEqual({ bgn: "202601010000", end: "202601312359" });
    expect(w[1]).toEqual({ bgn: "202602010000", end: "202602282359" });
    expect(w[5]).toEqual({ bgn: "202606010000", end: "202606302359" });
    for (const win of w) expect(win.bgn.slice(0, 6)).toBe(win.end.slice(0, 6));
  });
  it("부분 달 경계(시작·종료가 달 중간)", () => {
    const w = splitCalendarMonths("20260115", "20260310");
    expect(w).toEqual([
      { bgn: "202601150000", end: "202601312359" },
      { bgn: "202602010000", end: "202602282359" },
      { bgn: "202603010000", end: "202603102359" },
    ]);
  });
});
