import { describe, it, expect } from "vitest";
import { fanOut } from "../src/fanOut.js";

describe("fanOut", () => {
  it("성공은 value로, 실패는 error로 label 맵에 격리", async () => {
    const r = await fanOut(
      ["a", "b"],
      async (k) => { if (k === "b") throw new Error("b 실패"); return k.toUpperCase(); },
      { label: (k) => k, concurrency: 2 },
    );
    expect(r.results.a).toEqual({ ok: true, value: "A" });
    expect(r.results.b).toEqual({ ok: false, error: "b 실패" });
    expect(r.anySucceeded).toBe(true);
  });
  it("전부 실패면 anySucceeded=false", async () => {
    const r = await fanOut(["x"], async () => { throw new Error("nope"); }, { label: (k) => k, concurrency: 1 });
    expect(r.anySucceeded).toBe(false);
  });
  it("mapError로 에러 메시지 가공", async () => {
    const r = await fanOut(["x"], async () => { throw new Error("raw"); },
      { label: (k) => k, concurrency: 1, mapError: (_e, item) => `[${item}] 가공됨` });
    expect(r.results.x).toEqual({ ok: false, error: "[x] 가공됨" });
  });
  it("중복 label은 throw", async () => {
    await expect(fanOut(["a", "a"], async (k) => k, { label: () => "same", concurrency: 2 }))
      .rejects.toThrow(/중복 label/);
  });
  it("프로토타입 키와 겹치는 label도 첫 발생은 정상 처리", async () => {
    const r = await fanOut(
      ["constructor", "toString"],
      async (k) => k.length,
      { label: (k) => k, concurrency: 2 },
    );
    expect(r.results.constructor).toEqual({ ok: true, value: 11 });
    expect(r.results.toString).toEqual({ ok: true, value: 8 });
    expect(r.anySucceeded).toBe(true);
  });
});
