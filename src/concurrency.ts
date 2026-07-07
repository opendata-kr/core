// 인라인 세마포어. 외부 의존(p-limit 등) 없이 동시 실행 수를 limit으로 제한한다.
// 실패는 throw하지 않고 PromiseSettledResult로 격리해 호출자가 부분 실패를 다룰 수 있게 한다.
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let next = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  const worker = async (): Promise<void> => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i]!, i) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}
