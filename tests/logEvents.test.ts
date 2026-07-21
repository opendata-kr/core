import { describe, it, expect } from "vitest";
import { maskEvent } from "../src/logEvents.js";
import type {
  CallStartEvent,
  UpstreamEvent,
  CallEndEvent,
  CancelledEvent,
  LogEvent,
} from "../src/logEvents.js";

const base = { v: 1, ts: "2026-07-21T00:00:00.000Z", app: "test-app", callId: "cid-1" } as const;

function startEvent(args: unknown): CallStartEvent {
  return { ...base, type: "call_start", tool: "search_things", args };
}

function upstreamEvent(params: Record<string, unknown>): UpstreamEvent {
  return { ...base, type: "upstream", op: "getList", params, attempt: 0, ms: 12, ok: true };
}

describe("maskEvent", () => {
  it("중첩 객체·배열 안까지 serviceKey 키를 제거한다", () => {
    const event = upstreamEvent({
      serviceKey: "SECRET",
      pageNo: 1,
      nested: { serviceKey: "SECRET2", keep: "x" },
      list: [{ serviceKey: "SECRET3", keep: "y" }],
    });
    const masked = maskEvent(event, []) as UpstreamEvent;
    expect(masked.params).toEqual({
      pageNo: 1,
      nested: { keep: "x" },
      list: [{ keep: "y" }],
    });
  });

  it("키 값을 모든 문자열 필드에서 ***로 치환한다 (중첩 객체·배열 포함)", () => {
    const event = startEvent({
      q: "before SECRET after",
      nested: { note: "xSECRETy" },
      list: ["SECRET", { deep: "SECRET/SECRET" }],
    });
    const masked = maskEvent(event, ["SECRET"]) as CallStartEvent;
    expect(masked.args).toEqual({
      q: "before *** after",
      nested: { note: "x***y" },
      list: ["***", { deep: "***/***" }],
    });
  });

  it("키의 encodeURIComponent 변형도 치환한다 (URL 섞인 에러 메시지 방어)", () => {
    const key = "abc+def/ghi=";
    const event: CallEndEvent = {
      ...base,
      type: "call_end",
      outcome: "error",
      ms: 240,
      error: `request https://x?serviceKey=${encodeURIComponent(key)} failed (${key})`,
    };
    const masked = maskEvent(event, [key]) as CallEndEvent;
    expect(masked.error).toBe("request https://x?serviceKey=*** failed (***)");
  });

  it("키는 trim된 값을 기준으로 치환한다", () => {
    const event = startEvent({ q: "has SECRET inside" });
    const masked = maskEvent(event, ["  SECRET  "]) as CallStartEvent;
    expect(masked.args).toEqual({ q: "has *** inside" });
  });

  it("부재·공백 키는 생략한다 (문자 사이 삽입 병리 없음)", () => {
    const event = startEvent({ q: "unchanged text" });
    const masked = maskEvent(event, [undefined, "", "   "]) as CallStartEvent;
    expect(masked.args).toEqual({ q: "unchanged text" });
  });

  it("입력 이벤트를 변형하지 않는다 (순수 함수)", () => {
    const params = { serviceKey: "SECRET", q: "find SECRET" };
    const event = upstreamEvent(params);
    maskEvent(event, ["SECRET"]);
    expect(event.params).toEqual({ serviceKey: "SECRET", q: "find SECRET" });
  });

  it("문자열 아닌 값과 null은 그대로 통과한다", () => {
    const event = upstreamEvent({ pageNo: 3, flag: true, empty: null });
    const masked = maskEvent(event, ["SECRET"]) as UpstreamEvent;
    expect(masked.params).toEqual({ pageNo: 3, flag: true, empty: null });
  });

  it("이벤트 유니온 4종을 그대로 통과시킨다 (공통 필드 보존)", () => {
    const cancelled: CancelledEvent = { ...base, type: "cancelled", ms: 240_000 };
    const events: LogEvent[] = [
      startEvent({}),
      upstreamEvent({}),
      cancelled,
      { ...base, type: "call_end", outcome: "ok", ms: 10 },
    ];
    for (const event of events) {
      const masked = maskEvent(event, ["SECRET"]);
      expect(masked.v).toBe(1);
      expect(masked.ts).toBe(base.ts);
      expect(masked.app).toBe(base.app);
      expect(masked.callId).toBe(base.callId);
      expect(masked.type).toBe(event.type);
    }
  });
});
