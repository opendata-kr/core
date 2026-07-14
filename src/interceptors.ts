import type { DataGoKrResponse } from "./response.js";
import type { Params } from "./client.js";

// request 인터셉터가 받고 반환하는 값. fetch 이전이라 op·params만 존재한다.
export interface RequestContext {
  op: string;
  params: Params;
}

// response 인터셉터가 받는 값: 봉투 정규화 직후, 스키마 파싱 이전 shape.
export type EnvelopeResponse = DataGoKrResponse<Record<string, unknown>>;

// undefined 반환 = 원본 유지 (부수효과 전용 인터셉터가 반환을 잊어도 값이 사라지지 않게).
type RequestOnFulfilled = (
  ctx: RequestContext,
) => RequestContext | undefined | Promise<RequestContext | undefined>;

type ResponseOnFulfilled = (
  res: EnvelopeResponse,
) => EnvelopeResponse | undefined | Promise<EnvelopeResponse | undefined>;

// 값 반환(resolve) = 회복, throw(reject) = 다음 onRejected로 전파.
// undefined 반환 = 회복이 아니라 원본 에러 유지 (로깅 전용 onRejected의 실수 방어).
type ResponseOnRejected = (
  err: unknown,
) => EnvelopeResponse | undefined | Promise<EnvelopeResponse | undefined>;

// request 매니저에는 onRejected가 없다(파라미터 자체가 시그니처에 부재).
// 스키마 파싱 이전 단계의 모든 throw는 response 매니저의 onRejected 체인이 받는다.
export class RequestInterceptorManager {
  // Map은 삽입 순서를 보존하므로 등록순 직렬 실행과 eject를 함께 충족한다.
  private readonly handlers = new Map<number, RequestOnFulfilled>();
  private nextId = 0;

  use(onFulfilled: RequestOnFulfilled): number {
    const id = this.nextId++;
    this.handlers.set(id, onFulfilled);
    return id;
  }

  eject(id: number): void {
    this.handlers.delete(id);
  }

  // 등록순 직렬 실행. 각 반환값이 다음 인터셉터의 입력이 된다.
  async run(ctx: RequestContext): Promise<RequestContext> {
    let current = ctx;
    for (const onFulfilled of this.handlers.values()) {
      const next = await onFulfilled(current);
      if (next !== undefined) current = next;
    }
    return current;
  }
}

interface ResponseEntry {
  onFulfilled?: ResponseOnFulfilled;
  onRejected?: ResponseOnRejected;
}

export class ResponseInterceptorManager {
  private readonly handlers = new Map<number, ResponseEntry>();
  private nextId = 0;

  use(onFulfilled?: ResponseOnFulfilled, onRejected?: ResponseOnRejected): number {
    const id = this.nextId++;
    this.handlers.set(id, { onFulfilled, onRejected });
    return id;
  }

  eject(id: number): void {
    this.handlers.delete(id);
  }

  // 등록순 직렬 실행. onFulfilled가 없는 항목(onRejected 전용)은 건너뛴다.
  async runFulfilled(res: EnvelopeResponse): Promise<EnvelopeResponse> {
    let current = res;
    for (const { onFulfilled } of this.handlers.values()) {
      if (onFulfilled === undefined) continue;
      const next = await onFulfilled(current);
      if (next !== undefined) current = next;
    }
    return current;
  }

  // axios 관례의 에러 체인: onRejected가 값을 반환하면 회복이고 후순위를 건너뛴다.
  // throw하면 그 에러가 다음 onRejected의 입력이 되고, 전부 소진하면 마지막 에러를 전파한다.
  // undefined 반환은 회복이 아니다: 직전 에러를 그대로 다음 onRejected로 계속 전파해
  // 로깅 전용 onRejected가 undefined 응답을 만들지 못하게 한다.
  // 회복 값을 { recovered }로 감싸 호출측(파이프라인)이 정상 결과와 구분 없이 재진입하게 한다.
  async runRejected(err: unknown): Promise<{ recovered: EnvelopeResponse }> {
    let currentErr = err;
    for (const { onRejected } of this.handlers.values()) {
      if (onRejected === undefined) continue;
      try {
        const value = await onRejected(currentErr);
        if (value !== undefined) return { recovered: value };
      } catch (next) {
        currentErr = next;
      }
    }
    throw currentErr;
  }
}
