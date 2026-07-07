import { describe, it, expect } from "vitest";
import { normalizeResultCode, DataGoKrError } from "../src/errors.js";

describe("normalizeResultCode", () => {
  it("00은 정상", () => {
    expect(normalizeResultCode("00")).toEqual({ ok: true, noData: false });
  });
  it("0도 정상", () => {
    expect(normalizeResultCode("0").ok).toBe(true);
  });
  it("03은 noData", () => {
    expect(normalizeResultCode("03")).toEqual({ ok: false, noData: true });
  });
  it("그 외는 resultMsg를 통과한 DataGoKrError", () => {
    const r = normalizeResultCode("30", "SERVICE_KEY_IS_NOT_REGISTERED_ERROR");
    expect(r.error).toBeInstanceOf(DataGoKrError);
    expect(r.error!.code).toBe("30");
    expect(r.error!.resultMsg).toBe("SERVICE_KEY_IS_NOT_REGISTERED_ERROR");
  });
  it("resultMsg 없으면 일반 메시지", () => {
    expect(normalizeResultCode("99").error!.resultMsg).toBe("알 수 없는 오류");
  });
});

describe("DataGoKrError 분류", () => {
  it("코드 30은 auth·비재시도", () => {
    const e = new DataGoKrError("30", "SERVICE_KEY_IS_NOT_REGISTERED_ERROR");
    expect(e.kind).toBe("auth");
    expect(e.retryable).toBe(false);
  });
  it("httpStatus 503은 retryable", () => {
    const e = new DataGoKrError("", "서버 오류", { httpStatus: 503 });
    expect(e.retryable).toBe(true);
    expect(e.httpStatus).toBe(503);
  });
  it("httpStatus 400은 비재시도", () => {
    expect(new DataGoKrError("", "잘못된 요청", { httpStatus: 400 }).retryable).toBe(false);
  });
  it("kind network는 retryable, rawBody 보존", () => {
    const e = new DataGoKrError("", "타임아웃", { kind: "network", rawBody: "<xml/>" });
    expect(e.retryable).toBe(true);
    expect(e.rawBody).toBe("<xml/>");
  });
  it("빈 코드는 [?]로 표기하고 unknown", () => {
    const e = new DataGoKrError("", "결과코드 없음");
    expect(e.kind).toBe("unknown");
    expect(e.message).toContain("[?]");
  });
});

describe("normalizeResultCode 빈 코드", () => {
  it("빈 코드는 뭉개지 않고 unknown 에러", () => {
    const r = normalizeResultCode("", "");
    expect(r.error).toBeInstanceOf(DataGoKrError);
    expect(r.error!.kind).toBe("unknown");
    expect(r.error!.message).not.toBe("[] 알 수 없는 오류");
  });
});
