import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { create } from "../src/client.js";
import { createCallLogger } from "../src/callLogger.js";
import { textResult } from "../src/mcp.js";
import type { LogEvent } from "../src/logEvents.js";

const base = { baseURL: "https://apis.data.go.kr/1230000/ad/BidPublicInfoService" };

const okJson = (items: unknown[], totalCount = items.length) =>
  new Response(
    JSON.stringify({
      response: { header: { resultCode: "00" }, body: { totalCount, pageNo: 1, items } },
    }),
    { status: 200 },
  );

function readEvents(file: string): LogEvent[] {
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l !== "")
    .map((l) => JSON.parse(l) as LogEvent);
}

function ofType<T extends LogEvent["type"]>(
  events: LogEvent[],
  type: T,
): Extract<LogEvent, { type: T }>[] {
  return events.filter((e): e is Extract<LogEvent, { type: T }> => e.type === type);
}

// process.stderr.write 오버로드와 정확히 일치하는 스파이 타입을 추론으로 얻는다
// (ReturnType<typeof vi.spyOn> 명시 주석은 제네릭이 지워져 TS2322가 난다).
const spyStderr = () => vi.spyOn(process.stderr, "write").mockImplementation(() => true);

const realPlatform = process.platform;
function setPlatform(p: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value: p, configurable: true });
}

describe("createCallLogger", () => {
  let dir: string;
  let stderrSpy: ReturnType<typeof spyStderr>;

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "calllogger-"));
    stderrSpy = spyStderr();
  });
  afterEach(() => {
    setPlatform(realPlatform);
    stderrSpy.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  });

  it("종단: call_start → upstream → call_end가 같은 callId로 순서대로 기록된다", async () => {
    const logger = createCallLogger({ app: "test-app", dir, env: {} });
    expect(logger.enabled).toBe(true);
    const client = create({
      ...base,
      serviceKey: "KEY",
      fetch: vi.fn(async () => okJson([{ a: "1" }, { a: "2" }], 7)),
    });
    const handler = logger.tool("search_things", async (args: { q: string }) => {
      const r = await client.get("op", { params: { q: args.q } });
      return { n: r.data.length };
    });

    const result = await handler({ q: "도로" });
    await logger.flush();

    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0]!.text)).toEqual({ n: 2 });

    const events = readEvents(logger.file!);
    expect(events.map((e) => e.type)).toEqual(["call_start", "upstream", "call_end"]);
    const callIds = new Set(events.map((e) => e.callId));
    expect(callIds.size).toBe(1);
    expect(events.every((e) => e.v === 1 && e.app === "test-app")).toBe(true);
    expect(events.every((e) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(e.ts))).toBe(
      true,
    );

    const start = ofType(events, "call_start")[0]!;
    expect(start.tool).toBe("search_things");
    expect(start.args).toEqual({ q: "도로" });

    const up = ofType(events, "upstream")[0]!;
    expect(up).toMatchObject({ op: "op", attempt: 0, ok: true, count: 2, totalCount: 7 });

    const end = ofType(events, "call_end")[0]!;
    expect(end.outcome).toBe("ok");
    expect(end.error).toBeUndefined();
    expect(end.afterCancel).toBeUndefined();
    expect(typeof end.ms).toBe("number");
  });

  it("마스킹: call_start args의 서비스키(env 원천)가 ***로 치환된다", async () => {
    const logger = createCallLogger({
      app: "test-app",
      dir,
      env: { DATA_GO_KR_SERVICE_KEY: "ENVSECRET" },
    });
    const handler = logger.tool("t", async (_args: { q: string }) => "done");
    await handler({ q: "before ENVSECRET after" });
    await logger.flush();

    const raw = readFileSync(logger.file!, "utf8");
    expect(raw).not.toContain("ENVSECRET");
    const start = ofType(readEvents(logger.file!), "call_start")[0]!;
    expect(start.args).toEqual({ q: "before *** after" });
  });

  it("마스킹: call_end error의 서비스키가 ***로 치환된다", async () => {
    const logger = createCallLogger({
      app: "test-app",
      dir,
      env: { DATA_GO_KR_SERVICE_KEY: "ENVSECRET" },
    });
    const handler = logger.tool("t", async () => {
      throw new Error("boom ENVSECRET boom");
    });
    await handler({});
    await logger.flush();

    expect(readFileSync(logger.file!, "utf8")).not.toContain("ENVSECRET");
    const end = ofType(readEvents(logger.file!), "call_end")[0]!;
    expect(end.outcome).toBe("error");
    expect(end.error).toBe("boom *** boom");
  });

  it("마스킹: env에 없는 create 주입 키도 registerKey 합류로 upstream에서 치환된다", async () => {
    const logger = createCallLogger({ app: "test-app", dir, env: {} });
    const client = create({
      ...base,
      serviceKey: "INJECTEDKEY",
      fetch: vi.fn(async () => okJson([])),
    });
    const handler = logger.tool("t", async () => {
      // 파라미터 값에 키가 새는 경우를 재현한다. registerKey가 upstream 발신보다 선행하므로
      // 같은 attempt의 이벤트부터 치환이 적용된다.
      await client.get("op", { params: { echo: "INJECTEDKEY" } });
      return "ok";
    });
    await handler({});
    await logger.flush();

    expect(readFileSync(logger.file!, "utf8")).not.toContain("INJECTEDKEY");
    const up = ofType(readEvents(logger.file!), "upstream")[0]!;
    expect(up.params).toMatchObject({ echo: "***" });
  });

  it("run 예외는 isError 응답으로 변환되고 call_end는 outcome error + error를 담는다", async () => {
    const logger = createCallLogger({ app: "test-app", dir, env: {} });
    const handler = logger.tool("t", async () => {
      throw new Error("kaput");
    });
    const result = await handler({});
    await logger.flush();

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("kaput");
    const end = ofType(readEvents(logger.file!), "call_end")[0]!;
    expect(end).toMatchObject({ outcome: "error", error: "kaput" });
  });

  it("도구 자체 isError 반환은 그대로 통과하고 outcome error에 error 필드가 없다", async () => {
    const logger = createCallLogger({ app: "test-app", dir, env: {} });
    const own = textResult({ error: "직접 만든 에러" }, true);
    const handler = logger.tool("t", async () => own);
    const result = await handler({});
    await logger.flush();

    expect(result).toBe(own); // 이중 래핑 없이 통과
    const end = ofType(readEvents(logger.file!), "call_end")[0]!;
    expect(end.outcome).toBe("error");
    expect(end.error).toBeUndefined(); // 도구 자체 isError 본문은 재기록하지 않는다
  });

  it("content가 빈 배열인 도메인 payload는 TextToolResult로 오판하지 않고 래핑한다", async () => {
    const logger = createCallLogger({ app: "test-app", dir, env: {} });
    const payload = { content: [], totalElements: 0 };
    const handler = logger.tool("t", async () => payload);
    const result = await handler({});
    await logger.flush();

    // 공진리 every 오판이면 payload가 그대로 새어 클라이언트가 빈 응답을 받는다.
    expect(result).not.toBe(payload);
    expect(result.content).toHaveLength(1);
    expect(JSON.parse(result.content[0]!.text)).toEqual(payload);
    expect(ofType(readEvents(logger.file!), "call_end")[0]!.outcome).toBe("ok");
  });

  it("실행 중 abort는 cancelled를 즉시 기록하고 call_end에 afterCancel을 남긴다", async () => {
    const logger = createCallLogger({ app: "test-app", dir, env: {} });
    const ac = new AbortController();
    const handler = logger.tool("t", async () => {
      ac.abort();
      return "settled";
    });
    const result = await handler({}, { signal: ac.signal });
    await logger.flush();

    expect(result.isError).toBeUndefined();
    const events = readEvents(logger.file!);
    expect(events.map((e) => e.type)).toEqual(["call_start", "cancelled", "call_end"]);
    const cancelled = ofType(events, "cancelled")[0]!;
    expect(typeof cancelled.ms).toBe("number");
    const end = ofType(events, "call_end")[0]!;
    expect(end).toMatchObject({ outcome: "ok", afterCancel: true });
  });

  it("등록 전 이미 aborted면 리스너 대기 없이 즉시 cancelled를 기록한다", async () => {
    const logger = createCallLogger({ app: "test-app", dir, env: {} });
    const ac = new AbortController();
    ac.abort();
    const handler = logger.tool("t", async () => "late");
    await handler({}, { signal: ac.signal });
    await logger.flush();

    const events = readEvents(logger.file!);
    expect(events.map((e) => e.type)).toEqual(["call_start", "cancelled", "call_end"]);
    expect(ofType(events, "call_end")[0]!).toMatchObject({ outcome: "ok", afterCancel: true });
  });

  it("OPENDATA_LOG=off면 무경고 비활성: 파일 미생성, 변환·반환 계약은 유지", async () => {
    const logger = createCallLogger({ app: "test-app", dir, env: { OPENDATA_LOG: "off" } });
    expect(logger.enabled).toBe(false);
    expect(logger.file).toBeUndefined();

    const okHandler = logger.tool("t", async () => ({ n: 1 }));
    const ok = await okHandler({});
    expect(ok.isError).toBeUndefined();
    expect(JSON.parse(ok.content[0]!.text)).toEqual({ n: 1 });

    const errHandler = logger.tool("t", async () => {
      throw new Error("still converted");
    });
    const err = await errHandler({});
    expect(err.isError).toBe(true);
    expect(err.content[0]!.text).toContain("still converted");

    await logger.flush();
    expect(readdirSync(dir)).toEqual([]);
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("OPENDATA_LOG_DIR 오버라이드 경로에 기록한다", async () => {
    const logger = createCallLogger({ app: "test-app", env: { OPENDATA_LOG_DIR: dir } });
    const handler = logger.tool("t", async () => 1);
    await handler({});
    await logger.flush();

    expect(logger.file!.startsWith(dir + path.sep)).toBe(true);
    expect(readEvents(logger.file!).length).toBeGreaterThan(0);
  });

  it("미존재 경로는 mkdir recursive로 만들고 기록에 성공한다", async () => {
    const nested = path.join(dir, "a", "b");
    const logger = createCallLogger({ app: "test-app", dir: nested, env: {} });
    const handler = logger.tool("t", async () => 1);
    await handler({});
    await logger.flush();

    expect(existsSync(nested)).toBe(true);
    expect(readEvents(logger.file!).map((e) => e.type)).toEqual(["call_start", "call_end"]);
  });

  it("mkdir 실패(경로 자리에 일반 파일)는 경고 1회 후 비활성, 도구 경로는 무예외", async () => {
    const blocking = path.join(dir, "not-a-dir");
    writeFileSync(blocking, "x");
    const logger = createCallLogger({ app: "test-app", dir: blocking, env: {} });

    expect(logger.enabled).toBe(false);
    expect(logger.file).toBeUndefined();
    expect(stderrSpy).toHaveBeenCalledTimes(1);

    const handler = logger.tool("t", async () => ({ n: 1 }));
    const result = await handler({});
    expect(result.isError).toBeUndefined();
    await logger.flush();
    expect(stderrSpy).toHaveBeenCalledTimes(1);
  });

  it("unresolved(win32 LOCALAPPDATA 부재)는 경고 1회 후 비활성", async () => {
    setPlatform("win32");
    const logger = createCallLogger({ app: "test-app", env: {} });

    expect(logger.enabled).toBe(false);
    expect(logger.file).toBeUndefined();
    expect(stderrSpy).toHaveBeenCalledTimes(1);

    const handler = logger.tool("t", async () => 1);
    const result = await handler({});
    expect(result.isError).toBeUndefined();
  });

  it("직렬화 불가 이벤트(순환 참조 args)는 건너뛰고 도구 경로로 전파하지 않는다", async () => {
    const logger = createCallLogger({ app: "test-app", dir, env: {} });
    type Circular = { name: string; self?: unknown };
    const circular: Circular = { name: "loop" };
    circular.self = circular;

    const handler = logger.tool("t", async (_args: Circular) => ({ n: 1 }));
    const result = await handler(circular);
    await logger.flush();

    expect(result.isError).toBeUndefined();
    // call_start(순환 args)는 탈락하지만 이후 이벤트는 계속 기록된다
    const events = readEvents(logger.file!);
    expect(events.map((e) => e.type)).toEqual(["call_end"]);
  });
});
