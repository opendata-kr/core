export type ErrorKind = "throttle" | "auth" | "param" | "network" | "unknown";

// 확인된 data.go.kr 오류코드만 분류한다. 코드 30 = 등록되지 않은 서비스키(WebSearch 확인).
// 스로틀 코드 번호는 라이브 프로브로 확정 예정이라 지금은 비어 있다(전송 레벨 429/5xx로만 재시도).
const KNOWN_AUTH_CODES = new Set<string>(["30"]);
const KNOWN_THROTTLE_CODES = new Set<string>(); // TODO(live-probe): 요청제한 초과 코드 확정 후 채움

function classifyCode(code: string): ErrorKind {
  if (KNOWN_THROTTLE_CODES.has(code)) return "throttle";
  if (KNOWN_AUTH_CODES.has(code)) return "auth";
  return "unknown";
}

export interface DataGoKrErrorOptions {
  kind?: ErrorKind;
  httpStatus?: number;
  rawBody?: string;
}

export class DataGoKrError extends Error {
  readonly code: string;
  readonly resultMsg: string;
  readonly kind: ErrorKind;
  readonly retryable: boolean;
  readonly httpStatus?: number;
  readonly rawBody?: string;

  constructor(code: string, resultMsg: string, opts: DataGoKrErrorOptions = {}) {
    const suffix = opts.httpStatus !== undefined ? ` (HTTP ${opts.httpStatus})` : "";
    super(`[${code || "?"}] ${resultMsg}${suffix}`);
    this.name = "DataGoKrError";
    this.code = code;
    this.resultMsg = resultMsg;
    this.kind = opts.kind ?? classifyCode(code);
    const httpRetryable =
      opts.httpStatus === 429 || (opts.httpStatus !== undefined && opts.httpStatus >= 500);
    this.retryable = this.kind === "throttle" || this.kind === "network" || httpRetryable;
    this.httpStatus = opts.httpStatus;
    this.rawBody = opts.rawBody;
  }
}

export interface NormalizedResult {
  ok: boolean;
  noData: boolean;
  error?: DataGoKrError;
}

export function normalizeResultCode(code: string, resultMsg = ""): NormalizedResult {
  if (code === "00" || code === "0") return { ok: true, noData: false };
  if (code === "03") return { ok: false, noData: true };
  if (!code) {
    // 코드가 비어 원인을 특정 못 함. "[] 알 수 없는 오류"로 뭉개지 않고 unknown으로 표식한다.
    return {
      ok: false,
      noData: false,
      error: new DataGoKrError("", resultMsg || "응답에 결과코드가 없습니다", { kind: "unknown" }),
    };
  }
  return {
    ok: false,
    noData: false,
    error: new DataGoKrError(code, resultMsg || "알 수 없는 오류"),
  };
}
