import * as os from "node:os";
import * as path from "node:path";
import { readdirSync, statSync, unlinkSync } from "node:fs";

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FILES = 8;

export type LogDirResolution =
  | { kind: "off" } // 무경고 비활성 (OPENDATA_LOG=off)
  | { kind: "unresolved" } // 경고 대상 비활성 (경고 발화는 조립 계층 소관)
  | { kind: "dir"; dir: string };

// 로그 디렉터리 해석. 우선순위: off > dir 인자 > OPENDATA_LOG_DIR > 플랫폼 기본.
// 플랫폼 기본은 env-paths 4.0.0의 log 매핑 관례를 인라인한 것이다(darwin ~/Library/Logs,
// win32 %LOCALAPPDATA%\<name>\Log, 그 외 XDG_STATE_HOME 기본 ~/.local/state). 패키지 의존
// 대신 관례만 구현한다(suffix 없이 조직 단일 네임스페이스 opendata-kr).
export function resolveLogDir(
  env: Record<string, string | undefined>,
  dir?: string,
): LogDirResolution {
  if (env.OPENDATA_LOG === "off") return { kind: "off" };
  if (dir) return { kind: "dir", dir };
  if (env.OPENDATA_LOG_DIR) return { kind: "dir", dir: env.OPENDATA_LOG_DIR };

  const name = "opendata-kr";
  if (process.platform === "darwin") {
    return { kind: "dir", dir: path.join(os.homedir(), "Library", "Logs", name) };
  }
  if (process.platform === "win32") {
    const localAppData = env.LOCALAPPDATA;
    if (!localAppData) return { kind: "unresolved" };
    return { kind: "dir", dir: path.join(localAppData, name, "Log") };
  }
  const xdgStateHome = env.XDG_STATE_HOME?.trim();
  const stateHome = xdgStateHome || path.join(os.homedir(), ".local", "state");
  return { kind: "dir", dir: path.join(stateHome, name) };
}

export function logFileName(app: string, epochSec: number, pid: number): string {
  return `${app}.${epochSec}-${pid}.jsonl`;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 자기 app의 로그 파일 중 수정 시각 7일 초과분과 최신 8개 초과분을 best-effort 삭제한다.
// 살아있는 프로세스가 열어 둔 파일도 대상이 될 수 있으나 양 플랫폼 공통으로 수용한다
// (Node/libuv는 win32에서도 FILE_SHARE_DELETE로 열어 열린 파일 삭제가 성공한다).
export function pruneLogFiles(dir: string, app: string, nowMs: number): void {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  // logFileName 형식(<app>.<epoch 초>-<pid>.jsonl)만 매치해 다른 app·무관 파일을 보호한다.
  const pattern = new RegExp(`^${escapeRegExp(app)}\\.\\d+-\\d+\\.jsonl$`);
  const files: Array<{ path: string; mtimeMs: number }> = [];
  for (const fileName of names) {
    if (!pattern.test(fileName)) continue;
    const filePath = path.join(dir, fileName);
    try {
      files.push({ path: filePath, mtimeMs: statSync(filePath).mtimeMs });
    } catch {
      // stat 실패(경합 삭제 등)한 파일은 정리 대상에서 제외
    }
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  files.forEach((file, index) => {
    const expired = nowMs - file.mtimeMs > RETENTION_MS;
    if (!expired && index < MAX_FILES) return;
    try {
      unlinkSync(file.path);
    } catch {
      // best-effort: 권한·경합 실패는 무시 (다음 기동이 재시도)
    }
  });
}
