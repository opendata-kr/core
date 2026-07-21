import { describe, it, expect, vi } from "vitest";
import { create } from "../src/client.js";
import { callContext, type CallSink } from "../src/logContext.js";
import type { UpstreamPayload } from "../src/logEvents.js";

const base = {
  baseURL: "https://apis.data.go.kr/1230000/ad/BidPublicInfoService",
  serviceKey: "KEY",
};

const okJson = (items: unknown[], totalCount = items.length) =>
  new Response(
    JSON.stringify({
      response: { header: { resultCode: "00" }, body: { totalCount, pageNo: 1, items } },
    }),
    { status: 200 },
  );

type TraceEntry = { kind: "registerKey"; key: string } | { kind: "upstream"; e: UpstreamPayload };

function makeSink() {
  const trace: TraceEntry[] = [];
  const sink: CallSink = {
    upstream: (e: UpstreamPayload) => trace.push({ kind: "upstream", e }),
    registerKey: (key: string) => trace.push({ kind: "registerKey", key }),
  };
  const upstreams = () => trace.filter((t) => t.kind === "upstream").map((t) => t.e);
  return { sink, trace, upstreams };
}

describe("client upstream 계측 (ALS)", () => {
  it("성공 attempt는 registerKey → upstream 순서로 ok 이벤트를 발신한다", async () => {
    const { sink, trace, upstreams } = makeSink();
    const client = create({ ...base, fetch: vi.fn(async () => okJson([{ a: "1" }, { a: "2" }], 7)) });
    await callContext.run(sink, () => client.get("op", { params: { pageNo: 1 } }));
    expect(trace.map((t) => t.kind)).toEqual(["registerKey", "upstream"]);
    expect(trace[0]).toEqual({ kind: "registerKey", key: "KEY" });
    const e = upstreams()[0]!;
    expect(e).toMatchObject({ op: "op", attempt: 0, ok: true, count: 2, totalCount: 7 });
    expect(e.params).toMatchObject({ pageNo: 1 });
    expect(typeof e.ms).toBe("number");
    expect(e.ms).toBeGreaterThanOrEqual(0);
    expect(e.error).toBeUndefined();
    expect(e.errKind).toBeUndefined();
    expect(e.resultCode).toBeUndefined();
    expect(e.httpStatus).toBeUndefined();
  });

  it("registerKey는 해석된 서비스키(trim 적용)를 전달한다", async () => {
    const { sink, trace } = makeSink();
    const client = create({ ...base, serviceKey: "  KEY  ", fetch: vi.fn(async () => okJson([])) });
    await callContext.run(sink, () => client.get("op"));
    expect(trace[0]).toEqual({ kind: "registerKey", key: "KEY" });
  });

  it("HTTP 오류 attempt는 ok:false·error·errKind·httpStatus를 발신한다", async () => {
    const { sink, upstreams } = makeSink();
    const client = create({
      ...base,
      fetch: vi.fn(async () => new Response("bad", { status: 400 })),
      retry: { sleep: async () => {} },
    });
    await expect(callContext.run(sink, () => client.get("op"))).rejects.toThrow();
    const e = upstreams()[0]!;
    expect(e).toMatchObject({ attempt: 0, ok: false, errKind: "unknown", httpStatus: 400 });
    expect(e.error).toMatch(/HTTP 400/);
    expect(e.resultCode).toBeUndefined(); // code "" 보유 안 함
    expect(e.count).toBeUndefined();
    expect(e.totalCount).toBeUndefined();
  });

  it("resultCode 오류는 errKind와 resultCode를 함께 발신한다", async () => {
    const { sink, upstreams } = makeSink();
    const body = JSON.stringify({
      response: { header: { resultCode: "30", resultMsg: "SERVICE_KEY_IS_NOT_REGISTERED_ERROR" } },
    });
    const client = create({ ...base, fetch: vi.fn(async () => new Response(body, { status: 200 })) });
    await expect(callContext.run(sink, () => client.get("op"))).rejects.toThrow();
    expect(upstreams()[0]).toMatchObject({
      ok: false,
      errKind: "auth",
      resultCode: "30",
    });
  });

  it("재시도 2 attempt가 각각 기록되고 attempt마다 registerKey가 선행한다", async () => {
    const { sink, trace, upstreams } = makeSink();
    let n = 0;
    const fetchFn = (async () => {
      n++;
      return n === 1 ? new Response("x", { status: 503 }) : okJson([{ a: "1" }]);
    }) as unknown as typeof fetch;
    const client = create({ ...base, fetch: fetchFn, retry: { sleep: async () => {} } });
    const r = await callContext.run(sink, () => client.get("op"));
    expect(r.data).toHaveLength(1);
    expect(trace.map((t) => t.kind)).toEqual(["registerKey", "upstream", "registerKey", "upstream"]);
    const [e0, e1] = upstreams();
    expect(e0).toMatchObject({ attempt: 0, ok: false, httpStatus: 503 });
    expect(e1).toMatchObject({ attempt: 1, ok: true, count: 1 });
  });

  it("DataGoKrError 아닌 예외는 error만 담고 errKind가 없다", async () => {
    const { sink, upstreams } = makeSink();
    // text 메서드가 없는 비정상 Response: res.text() 호출이 TypeError로 raw 전파된다.
    const fetchFn = (async () => ({ ok: false, status: 500 })) as unknown as typeof fetch;
    const client = create({ ...base, fetch: fetchFn, retry: { sleep: async () => {} } });
    await expect(callContext.run(sink, () => client.get("op"))).rejects.toThrow();
    const e = upstreams()[0]!;
    expect(e.ok).toBe(false);
    expect(e.error).toBeTruthy();
    expect(e.errKind).toBeUndefined();
    expect(e.resultCode).toBeUndefined();
    expect(e.httpStatus).toBeUndefined();
  });

  it("store 부재 시 sink 호출 없이 기존 동작을 유지한다", async () => {
    const { sink, trace } = makeSink();
    const client = create({ ...base, fetch: vi.fn(async () => okJson([{ a: "1" }])) });
    const r = await client.get("op"); // callContext.run 밖
    expect(r.data).toHaveLength(1);
    expect(trace).toHaveLength(0);
    void sink;
  });
});
