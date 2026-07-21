import { AsyncLocalStorage } from "node:async_hooks";
import type { UpstreamPayload } from "./logEvents.js";

// 도구 호출 단위 상관 컨텍스트 (index 미노출 내부 모듈). logger.tool이 핸들러 실행을
// callContext.run(sink, ...)으로 감싸고, client.ts의 callWithRetry가 attempt 종료 시
// getStore()로 sink를 조회해 registerKey → upstream 순서로 발신한다. store 부재
// (로거 미채택 소비자·미래핑 호출)면 클라이언트는 완전 무동작이다.
export type CallSink = {
  upstream(e: UpstreamPayload): void;
  // 클라이언트가 자기 해석된 서비스키(trim 적용)를 마스킹 원천으로 등록한다
  // (create 옵션으로 키를 주입한 소비자까지 커버).
  registerKey(key: string): void;
};

export const callContext = new AsyncLocalStorage<CallSink>();
