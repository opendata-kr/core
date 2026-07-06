export class DataGoKrError extends Error {
  readonly code: string;
  readonly resultMsg: string;
  constructor(code: string, resultMsg: string) {
    super(`[${code}] ${resultMsg}`);
    this.name = "DataGoKrError";
    this.code = code;
    this.resultMsg = resultMsg;
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
  return {
    ok: false,
    noData: false,
    error: new DataGoKrError(code, resultMsg || "알 수 없는 오류"),
  };
}
