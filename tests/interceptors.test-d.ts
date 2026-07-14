import { describe, it, expectTypeOf } from "vitest";
import type {
  RequestInterceptorManager,
  ResponseInterceptorManager,
} from "../src/interceptors.js";

describe("인터셉터 매니저 타입 계약", () => {
  it("request 매니저 use에는 onRejected 파라미터가 타입상 존재하지 않는다 (파라미터 1개)", () => {
    expectTypeOf<Parameters<RequestInterceptorManager["use"]>["length"]>().toEqualTypeOf<1>();
  });

  it("response 매니저 use는 onFulfilled·onRejected 둘 다 선택 파라미터로 받는다", () => {
    expectTypeOf<Parameters<ResponseInterceptorManager["use"]>["length"]>().toEqualTypeOf<
      0 | 1 | 2
    >();
  });

  it("use는 둘 다 number id를 반환한다", () => {
    expectTypeOf<ReturnType<RequestInterceptorManager["use"]>>().toEqualTypeOf<number>();
    expectTypeOf<ReturnType<ResponseInterceptorManager["use"]>>().toEqualTypeOf<number>();
  });
});
