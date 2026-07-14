import { describe, it, expectTypeOf } from "vitest";
import { z } from "zod";
import type { DataGoKrClient } from "../src/client.js";
import type { DataGoKrResponse, PaginatedResponse, WindowedResponse } from "../src/response.js";

declare const client: DataGoKrClient;

const schema = z.looseObject({ bidNtceNo: z.string(), bidNtceNm: z.string() });
type Item = z.infer<typeof schema>;

describe("스키마 → 반환 타입 흐름 (AC-5)", () => {
  it("schema를 준 get의 반환이 z.infer 타입으로 흐른다", async () => {
    const r = await client.get("op", { schema });
    expectTypeOf(r).toEqualTypeOf<DataGoKrResponse<Item>>();
    expectTypeOf(r.data[0]!.bidNtceNo).toEqualTypeOf<string>();
  });

  it("paginate·paginateWindows도 동일 제네릭으로 운반한다", async () => {
    const p = await client.paginate("op", { schema, pageSize: 10, maxPages: 2 });
    expectTypeOf(p).toEqualTypeOf<PaginatedResponse<Item>>();
    const w = await client.paginateWindows("op", {
      schema,
      windows: [{ bgn: "202601010000", end: "202601312359" }],
      pageSize: 10,
      maxPages: 2,
      concurrency: 2,
    });
    expectTypeOf(w).toEqualTypeOf<WindowedResponse<Item>>();
  });

  it("schema 생략 시 data는 Record<string, unknown>[]", async () => {
    const r = await client.get("op");
    expectTypeOf(r.data).toEqualTypeOf<Record<string, unknown>[]>();
    const p = await client.paginate("op", { pageSize: 1, maxPages: 1 });
    expectTypeOf(p).toEqualTypeOf<PaginatedResponse<Record<string, unknown>>>();
  });
});

// T는 schema 검증에서만 태어난다: schema 없는 호출이 타입 인자로 무검증 T를
// 주장하는 것을 오버로드 분리가 컴파일 단계에서 차단한다.
describe("schema 없는 호출의 타입 인자 차단", () => {
  it("schema 없는 get·paginate·paginateWindows는 타입 인자를 받지 못한다", () => {
    // @ts-expect-error schema 없는 get은 타입 인자를 받지 않는다
    void client.get<{ x: string }>("op");
    // @ts-expect-error schema 없는 paginate는 타입 인자를 받지 않는다
    void client.paginate<{ x: string }>("op", { pageSize: 1, maxPages: 1 });
    // @ts-expect-error schema 없는 paginateWindows는 타입 인자를 받지 않는다
    void client.paginateWindows<{ x: string }>("op", {
      windows: [{ bgn: "202601010000", end: "202601312359" }],
      pageSize: 1,
      maxPages: 1,
      concurrency: 1,
    });
  });
});
