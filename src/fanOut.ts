import { mapWithConcurrency } from "./concurrency.js";
import { errMessage } from "./errMessage.js";

export type Outcome<R> = { ok: true; value: R } | { ok: false; error: string };

export interface FanOutResult<R, K extends string> {
  results: Record<K, Outcome<R>>;
  anySucceeded: boolean;
}

// label별 임의 비동기 작업을 concurrency 제한 하에 실행하고, label 결과맵으로 부분실패를 격리한다.
// mapWithConcurrency(저수준, index 기반) 위에 label 매핑과 에러 문자열화를 얹은 상위 계층이다.
// core는 K extends string 제약만 알고 구체 Kind 유니온은 호출부가 제네릭으로 바인딩한다.
export async function fanOut<T, R, K extends string>(
  items: readonly T[],
  task: (item: T, index: number) => Promise<R>,
  opts: { label: (item: T, index: number) => K; concurrency: number; mapError?: (reason: unknown, item: T) => string },
): Promise<FanOutResult<R, K>> {
  const settled = await mapWithConcurrency(items, opts.concurrency, task);
  const results = {} as Record<K, Outcome<R>>;
  let anySucceeded = false;
  settled.forEach((s, i) => {
    const item = items[i]!;
    const key = opts.label(item, i);
    if (key in results) throw new Error(`fanOut: 중복 label "${key}"`);
    if (s.status === "fulfilled") {
      results[key] = { ok: true, value: s.value };
      anySucceeded = true;
    } else {
      results[key] = { ok: false, error: opts.mapError ? opts.mapError(s.reason, item) : errMessage(s.reason) };
    }
  });
  return { results, anySucceeded };
}
