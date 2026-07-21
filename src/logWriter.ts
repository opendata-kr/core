import { open, type FileHandle } from "node:fs/promises";
import * as path from "node:path";
import { logFileName } from "./logPath.js";
import { errMessage } from "./errMessage.js";
import type { LogEvent } from "./logEvents.js";

// 파일 전환 임계값. 프로세스 내 누적 기록 바이트가 이를 넘으면 다음 이벤트부터 새 파일.
const MAX_FILE_BYTES = 5 * 1024 * 1024;

// stderr 진단 출력. stderr가 닫힌 환경(EPIPE)에서 write가 던지면 쓰기 체인·도구 경로가
// 오염되므로 진단 자체를 포기한다(무예외 계약이 진단보다 우선).
export function warnStderr(line: string): void {
  try {
    process.stderr.write(line);
  } catch {
    // stderr 닫힘: 진단 포기
  }
}

export type LogWriter = {
  write(event: LogEvent): void;
  flush(): Promise<void>;
  // 비활성 전환 전이면 현재 대상 파일의 절대경로(첫 write 전이어도 예정 경로), 비활성이면 undefined.
  readonly file: string | undefined;
  readonly disabled: boolean;
};

// jsonl 이벤트 writer. 핸들은 첫 이벤트 기록 시점에 lazy 오픈한다(flags "a", 이벤트 없는
// 프로세스는 파일 미생성). 프로세스 내 단일 promise 체인으로 append를 직렬화해 이벤트
// 순서를 보존하고, 쓰기 실패는 첫 회만 stderr 경고 후 영구 비활성으로 전환한다
// (도구 경로로 예외 전파 금지, stdout은 stdio 전송 오염 금지라 진단은 stderr 전용).
export function createLogWriter(opts: {
  dir: string;
  app: string;
  epochSec: number;
  pid: number;
  // 파일 전환 직후 호출된다(보존 정리 재실행용). 예외는 삼킨다.
  onRotate?: () => void;
}): LogWriter {
  let epochSec = opts.epochSec;
  let currentFile = path.resolve(opts.dir, logFileName(opts.app, epochSec, opts.pid));
  let handle: FileHandle | undefined;
  let bytes = 0;
  let disabled = false;
  let chain: Promise<void> = Promise.resolve();

  function disable(e: unknown): void {
    disabled = true;
    warnStderr(
      `[opendata-kr] 호출 로그 쓰기 실패, 로깅을 비활성화합니다 (${currentFile}): ${errMessage(e)}\n`,
    );
    const h = handle;
    handle = undefined;
    void h?.close().catch(() => {});
  }

  function write(event: LogEvent): void {
    if (disabled) return;
    // 직렬화는 enqueue 시점에 해 이후의 객체 변이가 기록에 새지 않게 한다.
    const line = Buffer.from(JSON.stringify(event) + "\n", "utf8");
    chain = chain.then(async () => {
      if (disabled) return;
      try {
        if (bytes > MAX_FILE_BYTES) {
          // 전환: 같은 명명 규칙에 새 epoch 초. 같은 초 안의 전환도 새 파일이 되도록
          // epoch를 단조 증가시킨다(동명 재사용이면 전환이 아니게 되므로).
          const old = handle;
          handle = undefined;
          bytes = 0;
          epochSec = Math.max(Math.floor(Date.now() / 1000), epochSec + 1);
          currentFile = path.resolve(opts.dir, logFileName(opts.app, epochSec, opts.pid));
          await old?.close().catch(() => {});
          // 전환 시에도 보존 정리를 재실행해 무재시작 장수 프로세스의 회전 파일 누적을
          // 디스크 상한 계약 안에 묶는다(기동 시 1회만으로는 상한이 뚫린다).
          try {
            opts.onRotate?.();
          } catch {
            // 정리 실패는 기록을 막지 않는다
          }
        }
        if (!handle) handle = await open(currentFile, "a");
        await handle.write(line);
        bytes += line.byteLength;
      } catch (e) {
        disable(e);
      }
    });
  }

  return {
    write,
    flush: () => chain,
    get file() {
      return disabled ? undefined : currentFile;
    },
    get disabled() {
      return disabled;
    },
  };
}
