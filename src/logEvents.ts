import type { ErrorKind } from "./errors.js";

// jsonl 이벤트 스키마 (라인당 이벤트 1건). 공통 필드는 스키마 버전 v(1) · ts(ISO 8601 UTC) ·
// app(서버 식별자) · callId(한 도구 호출의 이벤트를 묶는 상관 UUID) · type.
interface LogEventBase {
  v: 1;
  ts: string;
  app: string;
  callId: string;
}

// 핸들러 진입 즉시 기록. args는 마스킹 후 전문.
export interface CallStartEvent extends LogEventBase {
  type: "call_start";
  tool: string;
  args: unknown;
}

// 각 upstream attempt 종료 즉시 기록. 판별 유니온이 아니라 단일 인터페이스로 두고
// 조건부 필드(ok: true면 count·totalCount, ok: false면 error·errKind·resultCode·httpStatus)의
// 존재 조건은 기록 규칙·테스트가 강제한다.
export interface UpstreamEvent extends LogEventBase {
  type: "upstream";
  op: string;
  params: Record<string, unknown>;
  attempt: number; // 0기반
  ms: number;
  ok: boolean;
  count?: number;
  totalCount?: number;
  error?: string;
  errKind?: ErrorKind;
  resultCode?: string;
  httpStatus?: number;
}

// extra.signal abort 수신 즉시 기록. ms는 호출 시작 대비 경과.
export interface CancelledEvent extends LogEventBase {
  type: "cancelled";
  ms: number;
}

// 핸들러 정착 즉시 기록. error는 예외 경로에서만 채운다(도구 자체 isError 본문은 재기록 안 함).
export interface CallEndEvent extends LogEventBase {
  type: "call_end";
  outcome: "ok" | "error";
  ms: number;
  afterCancel?: boolean; // 취소 후 정착이면 true
  error?: string;
}

export type LogEvent = CallStartEvent | UpstreamEvent | CancelledEvent | CallEndEvent;

// 클라이언트 계측이 sink로 발신하는 upstream 본문(공통 필드 제외). UpstreamEvent에서
// Omit 파생하지 않고 명시 선언해 이벤트 스키마 변경이 sink 계약을 암묵 변경하지 않게 한다.
export type UpstreamPayload = {
  op: string;
  params: Record<string, unknown>;
  attempt: number;
  ms: number;
  ok: boolean;
  count?: number;
  totalCount?: number;
  error?: string;
  errKind?: ErrorKind;
  resultCode?: string;
  httpStatus?: number;
};

// 서비스키 마스킹 (순수 함수, 기록 시점마다 현재 키 집합으로 호출된다).
// keys는 해석된 서비스키 후보의 합집합. 각 키의 trim 값과 encodeURIComponent 변형을
// 모든 문자열 값에서 ***로 치환하고(에러 메시지에 URL이 섞이는 경우 방어), 중첩
// 객체·배열 포함 재귀 순회로 serviceKey 파라미터 키를 제거한다. 부재·공백 키는
// 생략한다(빈 문자열 치환의 전 문자 사이 삽입 병리 방지).
export function maskEvent(event: LogEvent, keys: ReadonlyArray<string | undefined>): LogEvent {
  const secrets: string[] = [];
  for (const raw of keys) {
    const key = raw?.trim();
    if (!key) continue;
    if (!secrets.includes(key)) secrets.push(key);
    const encoded = encodeURIComponent(key);
    if (encoded !== key && !secrets.includes(encoded)) secrets.push(encoded);
  }
  return maskValue(event, secrets) as LogEvent;
}

function maskValue(value: unknown, secrets: ReadonlyArray<string>): unknown {
  if (typeof value === "string") {
    let out = value;
    for (const secret of secrets) out = out.split(secret).join("***");
    return out;
  }
  if (Array.isArray(value)) return value.map((item) => maskValue(item, secrets));
  if (value !== null && typeof value === "object") {
    // plain object만 재구성 순회한다. Date·Map·URL 같은 비plain 객체를 Object.entries로
    // 재구성하면 {}로 왜곡돼 로그의 파라미터 복원이 불가능해지므로 그대로 통과시킨다
    // (직렬화는 JSON.stringify의 toJSON 관례를 따른다. 이 값 내부는 마스킹 순회 밖이다).
    const proto: unknown = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return value;
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (key === "serviceKey") continue;
      out[key] = maskValue(item, secrets);
    }
    return out;
  }
  return value;
}
