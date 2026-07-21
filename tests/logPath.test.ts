import { describe, it, expect, afterEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import { resolveLogDir, logFileName, pruneLogFiles } from "../src/logPath.js";

const realPlatform = process.platform;
function setPlatform(p: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value: p, configurable: true });
}
afterEach(() => setPlatform(realPlatform));

describe("resolveLogDir", () => {
  it("OPENDATA_LOG=off면 off (무경고 비활성)", () => {
    expect(resolveLogDir({ OPENDATA_LOG: "off" })).toEqual({ kind: "off" });
  });

  it("dir 인자가 OPENDATA_LOG_DIR보다 우선", () => {
    expect(resolveLogDir({ OPENDATA_LOG_DIR: "/from-env" }, "/from-opt")).toEqual({
      kind: "dir",
      dir: "/from-opt",
    });
  });

  it("OPENDATA_LOG_DIR가 플랫폼 기본보다 우선", () => {
    expect(resolveLogDir({ OPENDATA_LOG_DIR: "/from-env" })).toEqual({
      kind: "dir",
      dir: "/from-env",
    });
  });

  it("darwin 기본: ~/Library/Logs/opendata-kr", () => {
    setPlatform("darwin");
    expect(resolveLogDir({})).toEqual({
      kind: "dir",
      dir: path.join(os.homedir(), "Library", "Logs", "opendata-kr"),
    });
  });

  it("win32 기본: %LOCALAPPDATA%\\opendata-kr\\Log", () => {
    setPlatform("win32");
    expect(resolveLogDir({ LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local" })).toEqual({
      kind: "dir",
      dir: path.join("C:\\Users\\u\\AppData\\Local", "opendata-kr", "Log"),
    });
  });

  it("win32에서 LOCALAPPDATA 부재면 unresolved (경고 대상 비활성)", () => {
    setPlatform("win32");
    expect(resolveLogDir({})).toEqual({ kind: "unresolved" });
  });

  it("linux 기본: $XDG_STATE_HOME/opendata-kr", () => {
    setPlatform("linux");
    expect(resolveLogDir({ XDG_STATE_HOME: "/var/state" })).toEqual({
      kind: "dir",
      dir: path.join("/var/state", "opendata-kr"),
    });
  });

  it("linux에서 XDG_STATE_HOME 미설정이면 ~/.local/state/opendata-kr 폴백", () => {
    setPlatform("linux");
    expect(resolveLogDir({})).toEqual({
      kind: "dir",
      dir: path.join(os.homedir(), ".local", "state", "opendata-kr"),
    });
  });

  it("OPENDATA_LOG=off는 dir 동시 지정보다 우선", () => {
    expect(resolveLogDir({ OPENDATA_LOG: "off" }, "/from-opt")).toEqual({ kind: "off" });
  });

  it("linux에서 XDG_STATE_HOME이 공백이면 미설정과 동일하게 폴백", () => {
    setPlatform("linux");
    expect(resolveLogDir({ XDG_STATE_HOME: "   " })).toEqual({
      kind: "dir",
      dir: path.join(os.homedir(), ".local", "state", "opendata-kr"),
    });
  });
});

describe("logFileName", () => {
  it("<app>.<epochSec>-<pid>.jsonl 형식", () => {
    expect(logFileName("narajangteo-opening-mcp", 1753000000, 1234)).toBe(
      "narajangteo-opening-mcp.1753000000-1234.jsonl",
    );
  });
});

describe("pruneLogFiles", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const dirs: string[] = [];

  function makeDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "core-logpath-"));
    dirs.push(dir);
    return dir;
  }

  function makeFile(dir: string, name: string, mtimeMs: number): string {
    const p = path.join(dir, name);
    fs.writeFileSync(p, "");
    fs.utimesSync(p, mtimeMs / 1000, mtimeMs / 1000);
    return p;
  }

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      try {
        fs.chmodSync(dir, 0o755);
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // 임시 디렉터리 정리 실패는 테스트 결과와 무관
      }
    }
  });

  it("수정 시각 7일 초과분만 삭제하고 정확히 7일은 보존", () => {
    const dir = makeDir();
    const now = 1_753_000_000_000;
    const exactly7d = makeFile(dir, "app.100-1.jsonl", now - 7 * DAY_MS);
    const over7d = makeFile(dir, "app.200-2.jsonl", now - 7 * DAY_MS - 1000);
    pruneLogFiles(dir, "app", now);
    expect(fs.existsSync(exactly7d)).toBe(true);
    expect(fs.existsSync(over7d)).toBe(false);
  });

  it("최신 8개는 보존하고 9개째(가장 오래된 것)부터 삭제", () => {
    const dir = makeDir();
    const now = 1_753_000_000_000;
    const files = Array.from({ length: 9 }, (_, i) =>
      // i가 클수록 최신. 전부 7일 이내라 개수 규칙만 적용된다.
      makeFile(dir, `app.${100 + i}-1.jsonl`, now - (9 - i) * 60_000),
    );
    pruneLogFiles(dir, "app", now);
    expect(fs.existsSync(files[0]!)).toBe(false);
    for (const kept of files.slice(1)) expect(fs.existsSync(kept)).toBe(true);
  });

  it("정확히 8개면 아무것도 삭제하지 않는다", () => {
    const dir = makeDir();
    const now = 1_753_000_000_000;
    const files = Array.from({ length: 8 }, (_, i) =>
      makeFile(dir, `app.${100 + i}-1.jsonl`, now - (8 - i) * 60_000),
    );
    pruneLogFiles(dir, "app", now);
    for (const kept of files) expect(fs.existsSync(kept)).toBe(true);
  });

  it("다른 app 파일과 패턴 불일치 파일은 건드리지 않는다", () => {
    const dir = makeDir();
    const now = 1_753_000_000_000;
    const otherApp = makeFile(dir, "other.100-1.jsonl", now - 30 * DAY_MS);
    const notLog = makeFile(dir, "app.notes.txt", now - 30 * DAY_MS);
    const own = makeFile(dir, "app.100-1.jsonl", now - 30 * DAY_MS);
    pruneLogFiles(dir, "app", now);
    expect(fs.existsSync(otherApp)).toBe(true);
    expect(fs.existsSync(notLog)).toBe(true);
    expect(fs.existsSync(own)).toBe(false);
  });

  it("존재하지 않는 디렉터리에서도 던지지 않는다", () => {
    expect(() => pruneLogFiles("/no/such/dir/here", "app", Date.now())).not.toThrow();
  });

  it("삭제 실패(디렉터리 쓰기 권한 없음)는 무시한다", () => {
    const dir = makeDir();
    const now = 1_753_000_000_000;
    makeFile(dir, "app.100-1.jsonl", now - 30 * DAY_MS);
    fs.chmodSync(dir, 0o555);
    expect(() => pruneLogFiles(dir, "app", now)).not.toThrow();
  });
});
