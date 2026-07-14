import { describe, it, expectTypeOf } from "vitest";
import type { TextToolResult } from "../src/mcp.js";

// MCP SDK의 CallToolResult는 zod passthrough 산물이라 객체·content 원소 모두
// 문자열 인덱스 시그니처를 요구한다. SDK에 의존하지 않고 그 구조 요건만 재현한다.
type IndexSignatureToolResult = {
  [x: string]: unknown;
  content: { [x: string]: unknown; type: "text"; text: string }[];
  isError?: boolean;
};

describe("TextToolResult ↔ CallToolResult 구조 호환", () => {
  it("인덱스 시그니처를 요구하는 SDK형 타입에 할당된다 (interface로 되돌리면 깨진다)", () => {
    expectTypeOf<TextToolResult>().toExtend<IndexSignatureToolResult>();
  });
});
