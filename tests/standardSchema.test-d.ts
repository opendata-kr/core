import { describe, it, expectTypeOf } from "vitest";
import { z } from "zod";
import type { StandardSchemaV1, InferOutput } from "../src/standardSchema.js";

const schema = z.looseObject({ bidNtceNo: z.string(), bidNtceNm: z.string() });

describe("StandardSchemaV1 zod 호환", () => {
  it("looseObject 스키마가 StandardSchemaV1<unknown, T>에 대입 가능", () => {
    expectTypeOf(schema).toExtend<StandardSchemaV1<unknown, z.infer<typeof schema>>>();
  });
  it("InferOutput이 z.infer와 일치", () => {
    expectTypeOf<InferOutput<typeof schema>>().toEqualTypeOf<z.infer<typeof schema>>();
  });
});
