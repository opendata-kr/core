import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createLogWriter } from "../src/logWriter.js";
import type { CallStartEvent, LogEvent } from "../src/logEvents.js";

function ev(callId: string, args: unknown = { a: 1 }): CallStartEvent {
  return {
    v: 1,
    ts: "2026-07-21T00:00:00.000Z",
    app: "test-app",
    callId,
    type: "call_start",
    tool: "t",
    args,
  };
}

function readLines(file: string): LogEvent[] {
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l !== "")
    .map((l) => JSON.parse(l) as LogEvent);
}

// process.stderr.write 오버로드와 정확히 일치하는 스파이 타입을 추론으로 얻는다
// (ReturnType<typeof vi.spyOn> 명시 주석은 제네릭이 지워져 TS2322가 난다).
const spyStderr = () => vi.spyOn(process.stderr, "write").mockImplementation(() => true);

describe("createLogWriter", () => {
  let dir: string;
  let stderrSpy: ReturnType<typeof spyStderr>;

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "logwriter-"));
    stderrSpy = spyStderr();
  });
  afterEach(() => {
    stderrSpy.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  });

  it("lazy 오픈: 첫 write 전에는 파일을 만들지 않고 file은 예정 절대경로를 반환한다", async () => {
    const w = createLogWriter({ dir, app: "test-app", epochSec: 1000, pid: 42 });
    const expected = path.resolve(dir, "test-app.1000-42.jsonl");
    expect(w.file).toBe(expected);
    expect(w.disabled).toBe(false);
    expect(existsSync(expected)).toBe(false);
    await w.flush(); // write 없는 flush도 즉시 완료되고 파일을 만들지 않는다
    expect(existsSync(expected)).toBe(false);
    w.write(ev("c1"));
    await w.flush();
    expect(existsSync(expected)).toBe(true);
  });

  it("이벤트 순서를 보존하고 각 라인이 jsonl로 파싱된다", async () => {
    const w = createLogWriter({ dir, app: "test-app", epochSec: 1000, pid: 42 });
    w.write(ev("c1"));
    w.write(ev("c2"));
    w.write(ev("c3"));
    await w.flush();
    const events = readLines(w.file!);
    expect(events.map((e) => e.callId)).toEqual(["c1", "c2", "c3"]);
    expect(events[0]).toMatchObject({ v: 1, app: "test-app", type: "call_start" });
  });

  it("누적 5 MiB 초과 시 다음 이벤트부터 새 파일로 전환한다", async () => {
    const w = createLogWriter({ dir, app: "test-app", epochSec: 1000, pid: 42 });
    const firstFile = w.file!;
    const big = "x".repeat(1024 * 1024); // 이벤트당 약 1 MiB
    for (let i = 0; i < 6; i++) w.write(ev(`c${i}`, big));
    await w.flush();
    const secondFile = w.file!;
    expect(secondFile).not.toBe(firstFile);
    expect(readLines(firstFile).map((e) => e.callId)).toEqual(["c0", "c1", "c2", "c3", "c4"]);
    expect(readLines(secondFile).map((e) => e.callId)).toEqual(["c5"]);
    const names = readdirSync(dir).sort();
    expect(names).toHaveLength(2);
    expect(names.every((n) => /^test-app\.\d+-42\.jsonl$/.test(n))).toBe(true);
  });

  it("파일 전환 시 onRotate가 호출되고 onRotate 예외는 기록을 막지 않는다", async () => {
    const onRotate = vi.fn(() => {
      throw new Error("prune 실패");
    });
    const w = createLogWriter({ dir, app: "test-app", epochSec: 1000, pid: 42, onRotate });
    const big = "x".repeat(1024 * 1024);
    for (let i = 0; i < 6; i++) w.write(ev(`c${i}`, big));
    await w.flush();
    expect(onRotate).toHaveBeenCalledTimes(1);
    expect(w.disabled).toBe(false);
    expect(readLines(w.file!).map((e) => e.callId)).toEqual(["c5"]);
  });

  it("stderr가 닫혀 write가 던져도(EPIPE) 체인·flush는 오염되지 않는다", async () => {
    stderrSpy.mockImplementation(() => {
      throw new Error("EPIPE");
    });
    const missing = path.join(dir, "no-such-dir");
    const w = createLogWriter({ dir: missing, app: "test-app", epochSec: 1000, pid: 42 });
    w.write(ev("c1"));
    await expect(w.flush()).resolves.toBeUndefined();
    expect(w.disabled).toBe(true);
    // 이후 write·flush도 무예외로 유지된다 (영구 reject 체인 없음)
    w.write(ev("c2"));
    await expect(w.flush()).resolves.toBeUndefined();
  });

  it("쓰기 실패는 stderr 경고 1회 후 영구 비활성 전환하고 예외를 전파하지 않는다", async () => {
    const missing = path.join(dir, "no-such-dir");
    const w = createLogWriter({ dir: missing, app: "test-app", epochSec: 1000, pid: 42 });
    w.write(ev("c1"));
    await w.flush();
    expect(w.disabled).toBe(true);
    expect(w.file).toBeUndefined();
    expect(stderrSpy).toHaveBeenCalledTimes(1);
    // 비활성 후 write는 무동작이고 경고도 반복하지 않는다
    w.write(ev("c2"));
    await w.flush();
    expect(stderrSpy).toHaveBeenCalledTimes(1);
    expect(existsSync(missing)).toBe(false);
  });
});
