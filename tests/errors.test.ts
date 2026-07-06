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
