import { describe, it, expect } from "vitest";
import { withKeyHint } from "../src/keyHint.js";

describe("withKeyHint", () => {
  it("pre-encoded 키 + 인증류 메시지면 회복 안내 부가", () => {
    const out = withKeyHint({ serviceKeyLooksPreEncoded: true }, "HTTP 401 인증 실패");
    expect(out).toContain("Decoding 인증키");
  });
  it("pre-encoded가 아니면 원문 유지", () => {
    expect(withKeyHint({ serviceKeyLooksPreEncoded: false }, "HTTP 401")).toBe("HTTP 401");
  });
  it("인증류가 아니면 원문 유지", () => {
    expect(withKeyHint({ serviceKeyLooksPreEncoded: true }, "타임아웃")).toBe("타임아웃");
  });
});
