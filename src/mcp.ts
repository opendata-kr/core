import { errMessage } from "./errMessage.js";

// MCP 도구 응답의 구조적 타입. SDK의 CallToolResult와 호환되는 부분집합만 정의해
// MCP SDK 의존 없이 서비스 리포의 registerTool 콜백 반환값으로 쓴다.
// interface가 아니라 type alias여야 한다: CallToolResult는 zod passthrough 산물이라
// 문자열 인덱스 시그니처를 요구하는데, TS에서 암묵 인덱스 시그니처는 type alias에만 붙는다.
export type TextToolResult = {
  content: { type: "text"; text: string }[];
  isError?: true;
};

// payload를 JSON 텍스트 콘텐츠 하나로 감싼다. 성공 응답은 isError 키 자체를 두지 않는다
// (MCP 클라이언트가 키 존재만으로 에러를 판별하는 경우를 피한다).
export function textResult(payload: unknown, isError = false): TextToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    ...(isError ? { isError: true as const } : {}),
  };
}

// 도구 핸들러 본문을 감싸 예외를 MCP 에러 응답으로 변환한다.
// 키 힌트 등 부가 문구는 조립하지 않는다. 에러 message는 상류(기본 인터셉터)가 이미 완성한다.
export async function guard(run: () => Promise<unknown>): Promise<TextToolResult> {
  try {
    return textResult(await run());
  } catch (err) {
    return textResult({ error: errMessage(err) }, true);
  }
}

// 조회 전용 data.go.kr 도구의 표준 애노테이션. readOnlyHint 기본값(false)을 뒤집고
// 외부 API 호출임을 openWorldHint로 명시한다.
export const READONLY = { readOnlyHint: true, openWorldHint: true } as const;
