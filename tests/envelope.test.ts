import { describe, it, expect } from "vitest";
import { normalizeItems } from "../src/envelope.js";

describe("normalizeItems", () => {
  it("배열 직접(조달청)", () => {
    expect(normalizeItems([{ a: "1" }])).toEqual([{ a: "1" }]);
  });
  it("items.item 배열 중첩(기상청)", () => {
    expect(normalizeItems({ item: [{ a: "1" }] })).toEqual([{ a: "1" }]);
  });
  it("items.item 단건 객체", () => {
    expect(normalizeItems({ item: { a: "1" } })).toEqual([{ a: "1" }]);
  });
  it("빈 문자열", () => {
    expect(normalizeItems("")).toEqual([]);
  });
  it("undefined", () => {
    expect(normalizeItems(undefined)).toEqual([]);
  });
});
