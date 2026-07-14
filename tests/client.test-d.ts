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
  });
});
