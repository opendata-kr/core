import { describe, it, expect, vi } from "vitest";
import {
  RequestInterceptorManager,
  ResponseInterceptorManager,
  type RequestContext,
  type EnvelopeResponse,
} from "../src/interceptors.js";

function makeCtx(): RequestContext {
  return { op: "getBidPblancListInfoServc", params: { pageNo: 1 } };
}

function makeRes(marker: string): EnvelopeResponse {
  return { data: [{ marker }], totalCount: 1, pageNo: 1, invalid: [] };
}

describe("RequestInterceptorManager", () => {
  it("등록 순서대로 직렬 실행한다", async () => {
    const m = new RequestInterceptorManager();
    const order: string[] = [];
    m.use((ctx) => {
      order.push("첫째");
      return ctx;
    });
    m.use((ctx) => {
      order.push("둘째");
      return ctx;
    });
    await m.run(makeCtx());
    expect(order).toEqual(["첫째", "둘째"]);
  });

  it("onFulfilled 반환값이 다음 인터셉터의 입력이 된다", async () => {
    const m = new RequestInterceptorManager();
    m.use((ctx) => ({ ...ctx, params: { ...ctx.params, added: "a" } }));
    m.use((ctx) => ({ ...ctx, params: { ...ctx.params, chained: String(ctx.params["added"]) } }));
    const out = await m.run(makeCtx());
    expect(out.params).toEqual({ pageNo: 1, added: "a", chained: "a" });
  });

  it("undefined 반환은 원본 유지로 취급한다 (부수효과 전용 인터셉터)", async () => {
    const m = new RequestInterceptorManager();
    const seen: RequestContext[] = [];
    m.use((ctx) => {
      seen.push(ctx);
      return undefined;
    });
    m.use((ctx) => ({ ...ctx, op: "변형" }));
    const input = makeCtx();
    const out = await m.run(input);
    expect(seen[0]).toBe(input);
    expect(out.op).toBe("변형");
    expect(out.params).toEqual(input.params);
  });

  it("async 인터셉터를 허용하고 완료를 기다린다", async () => {
    const m = new RequestInterceptorManager();
    m.use(async (ctx) => {
      await Promise.resolve();
      return { ...ctx, op: "비동기변형" };
    });
    const out = await m.run(makeCtx());
    expect(out.op).toBe("비동기변형");
  });

  it("eject(id) 이후에는 실행되지 않는다", async () => {
    const m = new RequestInterceptorManager();
    const spy = vi.fn((ctx: RequestContext) => ctx);
    const id = m.use(spy);
    m.eject(id);
    await m.run(makeCtx());
    expect(spy).not.toHaveBeenCalled();
  });

  it("use는 매 등록마다 서로 다른 number id를 반환한다", () => {
    const m = new RequestInterceptorManager();
    const a = m.use((ctx) => ctx);
    const b = m.use((ctx) => ctx);
    expect(typeof a).toBe("number");
    expect(typeof b).toBe("number");
    expect(a).not.toBe(b);
  });

  it("eject는 지정한 id만 제거하고 나머지는 유지한다", async () => {
    const m = new RequestInterceptorManager();
    const removed = vi.fn((ctx: RequestContext) => ctx);
    const kept = vi.fn((ctx: RequestContext) => ctx);
    const id = m.use(removed);
    m.use(kept);
    m.eject(id);
    await m.run(makeCtx());
    expect(removed).not.toHaveBeenCalled();
    expect(kept).toHaveBeenCalledTimes(1);
  });
});

describe("ResponseInterceptorManager onFulfilled", () => {
  it("등록 순서대로 직렬 실행하고 반환값을 전파한다", async () => {
    const m = new ResponseInterceptorManager();
    m.use((res) => ({ ...res, totalCount: res.totalCount + 1 }));
    m.use((res) => ({ ...res, totalCount: res.totalCount * 10 }));
    const out = await m.runFulfilled(makeRes("원본"));
    // (1 + 1) * 10 = 20: 등록순이 뒤집히면 1 * 10 + 1 = 11이 된다.
    expect(out.totalCount).toBe(20);
  });

  it("undefined 반환은 원본 유지로 취급한다", async () => {
    const m = new ResponseInterceptorManager();
    m.use(() => undefined);
    const input = makeRes("원본");
    const out = await m.runFulfilled(input);
    expect(out).toBe(input);
  });

  it("onFulfilled 생략 등록(onRejected 전용)은 fulfilled 체인에서 건너뛴다", async () => {
    const m = new ResponseInterceptorManager();
    m.use(undefined, (err) => {
      throw err;
    });
    const input = makeRes("원본");
    const out = await m.runFulfilled(input);
    expect(out).toBe(input);
  });

  it("eject(id) 이후에는 실행되지 않는다", async () => {
    const m = new ResponseInterceptorManager();
    const spy = vi.fn((res: EnvelopeResponse) => res);
    const id = m.use(spy);
    m.eject(id);
    await m.runFulfilled(makeRes("원본"));
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("ResponseInterceptorManager onRejected", () => {
  it("값 반환 = 회복이고, 후순위 onRejected를 건너뛴다", async () => {
    const m = new ResponseInterceptorManager();
    const recovered = makeRes("회복값");
    const later = vi.fn((err: unknown): EnvelopeResponse => {
      throw err;
    });
    m.use(undefined, () => recovered);
    m.use(undefined, later);
    const out = await m.runRejected(new Error("원인"));
    expect(out.recovered).toBe(recovered);
    expect(later).not.toHaveBeenCalled();
  });

  it("재던진 에러가 다음 onRejected의 입력이 된다", async () => {
    const m = new ResponseInterceptorManager();
    const seen: unknown[] = [];
    m.use(undefined, (err) => {
      seen.push(err);
      throw new Error("변환된 에러");
    });
    m.use(undefined, (err) => {
      seen.push(err);
      return makeRes("회복값");
    });
    await m.runRejected(new Error("최초 에러"));
    expect((seen[0] as Error).message).toBe("최초 에러");
    expect((seen[1] as Error).message).toBe("변환된 에러");
  });

  it("전부 재던지면 마지막 에러가 최종 전파된다", async () => {
    const m = new ResponseInterceptorManager();
    m.use(undefined, () => {
      throw new Error("첫째 재던짐");
    });
    m.use(undefined, () => {
      throw new Error("둘째 재던짐");
    });
    await expect(m.runRejected(new Error("최초 에러"))).rejects.toThrow("둘째 재던짐");
  });

  it("onRejected가 하나도 없으면 원본 에러가 그대로 전파된다", async () => {
    const m = new ResponseInterceptorManager();
    m.use((res) => res);
    await expect(m.runRejected(new Error("원본 에러"))).rejects.toThrow("원본 에러");
  });

  it("async onRejected의 resolve 값도 회복으로 처리한다", async () => {
    const m = new ResponseInterceptorManager();
    const recovered = makeRes("비동기 회복");
    m.use(undefined, async () => {
      await Promise.resolve();
      return recovered;
    });
    const out = await m.runRejected(new Error("원인"));
    expect(out.recovered).toBe(recovered);
  });

  it("async onRejected의 reject도 재던짐으로 다음 onRejected에 전달된다", async () => {
    const m = new ResponseInterceptorManager();
    m.use(undefined, async () => {
      await Promise.resolve();
      throw new Error("비동기 재던짐");
    });
    m.use(undefined, (err) => {
      expect((err as Error).message).toBe("비동기 재던짐");
      return makeRes("회복값");
    });
    const out = await m.runRejected(new Error("최초 에러"));
    expect(out.recovered.data).toEqual([{ marker: "회복값" }]);
  });

  it("eject한 항목의 onRejected는 실행되지 않는다", async () => {
    const m = new ResponseInterceptorManager();
    const spy = vi.fn((): EnvelopeResponse => makeRes("회복값"));
    const id = m.use(undefined, spy);
    m.eject(id);
    await expect(m.runRejected(new Error("원인"))).rejects.toThrow("원인");
    expect(spy).not.toHaveBeenCalled();
  });
});
