import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { resolveLogDir, pruneLogFiles } from "./logPath.js";
import { createLogWriter, type LogWriter } from "./logWriter.js";
import { callContext, type CallSink } from "./logContext.js";
import { maskEvent, type LogEvent, type UpstreamPayload } from "./logEvents.js";
import { guard, type TextToolResult } from "./mcp.js";
import { errMessage } from "./errMessage.js";

export interface CallLoggerOptions {
  app: string; // 로그 파일명이 되는 서버 식별자 (예: "narajangteo-opening-mcp")
  dir?: string; // 테스트 주입용 경로 오버라이드
  env?: Record<string, string | undefined>; // 테스트 주입용, 기본 process.env
}

export interface CallLogger {
  readonly enabled: boolean; // off·경로 해석 실패 시 false
  readonly file: string | undefined; // 활성 시 현재 로그 파일 절대경로
  tool<A>(
    name: string,
    run: (args: A) => Promise<unknown>,
  ): (args: A, extra?: { signal?: AbortSignal }) => Promise<TextToolResult>;
  flush(): Promise<void>; // 대기 중 쓰기 완료 대기 (테스트·종료용)
}

// run이 이미 완성된 TextToolResult를 반환했는지 구조로 판별한다. 도구가 스스로 만든
// isError 응답을 guard의 textResult 재래핑 없이 그대로 통과시키기 위한 검사다.
function isTextToolResult(value: unknown): value is TextToolResult {
  if (typeof value !== "object" || value === null) return false;
  const content = (value as { content?: unknown }).content;
  return (
    Array.isArray(content) &&
    content.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        (item as { type?: unknown }).type === "text" &&
        typeof (item as { text?: unknown }).text === "string",
    )
  );
}

// 도구 호출 로거 조립. 경로 해석(off > dir > OPENDATA_LOG_DIR > 플랫폼 기본) → 디렉터리
// 생성 → 보존 정리 → writer 순서로 준비하고, 실패는 stderr 경고 1회 후 비활성으로
// 진행한다(서버 기동을 막지 않는다). 비활성 로거의 tool()도 변환·반환 계약은 그대로
// 유지하고 기록만 생략한다.
export function createCallLogger(options: CallLoggerOptions): CallLogger {
  const app = options.app;
  const env = options.env ?? process.env;

  let writer: LogWriter | undefined;
  const resolution = resolveLogDir(env, options.dir);
  if (resolution.kind === "unresolved") {
    process.stderr.write(
      `[opendata-kr] 로그 경로를 해석할 수 없어 호출 로깅을 비활성화합니다 (LOCALAPPDATA 부재)\n`,
    );
  } else if (resolution.kind === "dir") {
    try {
      mkdirSync(resolution.dir, { recursive: true });
      pruneLogFiles(resolution.dir, app, Date.now());
      writer = createLogWriter({
        dir: resolution.dir,
        app,
        epochSec: Math.floor(Date.now() / 1000),
        pid: process.pid,
      });
    } catch (e) {
      process.stderr.write(
        `[opendata-kr] 로그 디렉터리 생성 실패, 호출 로깅을 비활성화합니다 (${resolution.dir}): ${errMessage(e)}\n`,
      );
    }
  }
  // resolution.kind === "off"는 무경고 비활성이다.

  // 마스킹 키 집합 (mutable). 초기값은 로거 env의 해석된 서비스키(trim)이고, 클라이언트가
  // registerKey로 자기 해석된 키를 합류시킨다(create 옵션 주입 소비자 커버). 기록되는
  // 모든 이벤트에 현재 집합이 적용된다.
  const maskKeys = new Set<string>();
  const envKey = env.DATA_GO_KR_SERVICE_KEY?.trim();
  if (envKey) maskKeys.add(envKey);

  // 마스킹·직렬화(logWriter.write의 동기 JSON.stringify 포함)에서 어떤 예외도 도구 경로로
  // 전파하지 않는다. 직렬화 불가 이벤트(순환 참조 등)는 그 이벤트만 건너뛴다.
  let warnedUnserializable = false;
  function record(event: LogEvent): void {
    const w = writer;
    if (!w || w.disabled) return;
    try {
      w.write(maskEvent(event, [...maskKeys]));
    } catch (e) {
      if (!warnedUnserializable) {
        warnedUnserializable = true;
        process.stderr.write(
          `[opendata-kr] 호출 로그 이벤트 직렬화 실패, 해당 이벤트를 건너뜁니다: ${errMessage(e)}\n`,
        );
      }
    }
  }

  function baseFields(callId: string): { v: 1; ts: string; app: string; callId: string } {
    return { v: 1, ts: new Date().toISOString(), app, callId };
  }

  // 클라이언트 계측(callWithRetry)이 catch 블록 안에서 직접 호출하는 sink. 무예외 계약이다.
  function makeSink(callId: string): CallSink {
    return {
      upstream(e: UpstreamPayload): void {
        try {
          record({ ...baseFields(callId), type: "upstream", ...e });
        } catch {
          // 무예외 계약: 기록 실패가 클라이언트 에러 경로를 오염시키지 않는다
        }
      },
      registerKey(key: string): void {
        try {
          const trimmed = key.trim();
          if (trimmed) maskKeys.add(trimmed);
        } catch {
          // 무예외 계약
        }
      },
    };
  }

  function tool<A>(
    name: string,
    run: (args: A) => Promise<unknown>,
  ): (args: A, extra?: { signal?: AbortSignal }) => Promise<TextToolResult> {
    return async (args, extra) => {
      const callId = randomUUID();
      const startedMs = Date.now();
      let cancelled = false;

      record({ ...baseFields(callId), type: "call_start", tool: name, args });

      const signal = extra?.signal;
      const onAbort = (): void => {
        cancelled = true;
        record({ ...baseFields(callId), type: "cancelled", ms: Date.now() - startedMs });
      };
      // abort는 재발화하지 않으므로 이미 aborted면 선검사로 즉시 기록한다(리스너만 걸면 누락).
      if (signal?.aborted) onAbort();
      else signal?.addEventListener("abort", onAbort, { once: true });

      let raw: unknown;
      let didThrow = false;
      let thrown: unknown;
      try {
        const guarded = await callContext.run(makeSink(callId), () =>
          guard(async () => {
            try {
              raw = await run(args);
              return raw;
            } catch (e) {
              didThrow = true;
              thrown = e;
              throw e;
            }
          }),
        );
        // guard 재사용: 예외는 isError 응답으로, 일반 payload는 textResult로 변환된다.
        // run이 이미 TextToolResult를 반환한 경우만 재래핑 없이 통과시킨다(도구 자체
        // isError 응답의 outcome 판정을 위해).
        const result = !didThrow && isTextToolResult(raw) ? raw : guarded;
        record({
          ...baseFields(callId),
          type: "call_end",
          outcome: didThrow || result.isError === true ? "error" : "ok",
          ms: Date.now() - startedMs,
          ...(cancelled ? { afterCancel: true as const } : {}),
          // error는 예외 경로에서만 채운다(도구 자체 isError 본문은 재기록하지 않는다).
          ...(didThrow ? { error: errMessage(thrown) } : {}),
        });
        return result;
      } finally {
        signal?.removeEventListener("abort", onAbort);
      }
    };
  }

  return {
    get enabled() {
      return writer !== undefined && !writer.disabled;
    },
    get file() {
      return writer?.file;
    },
    tool,
    flush: () => writer?.flush() ?? Promise.resolve(),
  };
}
