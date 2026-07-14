import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "node",
    passWithNoTests: true,
    // *.test-d.ts 타입 테스트를 tsc로 검증한다. 본 tsconfig은 src만 include라 전용 tsconfig을 쓴다.
    typecheck: { enabled: true, tsconfig: "./tsconfig.test.json" },
  },
});
