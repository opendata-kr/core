import { describe, it, expect } from "vitest";
import { textResult, guard, READONLY } from "../src/mcp.js";

describe("textResult", () => {
  it("payload를 2칸 들여쓰기 JSON text 콘텐츠로 감싼다", () => {
    const result = textResult({ a: 1 });
    expect(result.content).toEqual([
      { type: "text", text: JSON.stringify({ a: 1 }, null, 2) },
    ]);
  });

  it("기본 호출(isError=false)에는 isError 키 자체가 없다", () => {
    const result = textResult("ok");
    expect(Object.keys(result)).toEqual(["content"]);
    expect("isError" in result).toBe(false);
  });

  it("isError=true면 isError: true를 포함한다", () => {
    const result = textResult({ error: "boom" }, true);
    expect(result.isError).toBe(true);
  });
});

describe("guard", () => {
  it("성공 시 run 반환값을 textResult로 감싼다(isError 없음)", async () => {
    const result = await guard(async () => ({ rows: [1, 2] }));
    expect(result).toEqual({
      content: [{ type: "text", text: JSON.stringify({ rows: [1, 2] }, null, 2) }],
    });
    expect("isError" in result).toBe(false);
  });

  it("실패 시 { error: errMessage } 페이로드와 isError: true를 반환한다", async () => {
    const result = await guard(async () => {
      throw new Error("호출 실패");
    });
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      { type: "text", text: JSON.stringify({ error: "호출 실패" }, null, 2) },
    ]);
  });

  it("비Error throw도 문자열로 축약해 담는다", async () => {
    const result = await guard(async () => {
      throw "원시 문자열";
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe(
      JSON.stringify({ error: "원시 문자열" }, null, 2),
    );
  });
});

describe("READONLY", () => {
  it("조회 전용 애노테이션 쌍을 담는다", () => {
    expect(READONLY).toEqual({ readOnlyHint: true, openWorldHint: true });
  });
});
