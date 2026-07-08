import { describe, it, expect } from "vitest";
import { errMessage } from "../src/errMessage.js";

describe("errMessage", () => {
  it("Error는 message를 반환", () => {
    expect(errMessage(new Error("실패함"))).toBe("실패함");
  });
  it("비Error는 String으로 축약", () => {
    expect(errMessage("문자열")).toBe("문자열");
    expect(errMessage(undefined)).toBe("undefined");
  });
});
