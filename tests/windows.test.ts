import { describe, it, expect } from "vitest";
import { splitDateWindows } from "../src/windows.js";

describe("splitDateWindows", () => {
  it("maxDays 이하면 단일 창(00:00~23:59)", () => {
    expect(splitDateWindows("20260601", "20260607", 7)).toEqual([{ bgn: "202606010000", end: "202606072359" }]);
  });
  it("넓은 기간을 maxDays 단위로 분할", () => {
    const w = splitDateWindows("20260601", "20260620", 7);
    expect(w).toHaveLength(3);
    expect(w[0]).toEqual({ bgn: "202606010000", end: "202606072359" });
    expect(w[2]!.end).toBe("202606202359");
  });
});
