import type { OperationResult, RawItem } from "./envelope.js";
import type { Params } from "./client.js";

export type PageCaller = (op: string, params: Params) => Promise<OperationResult>;

export interface PagedResult {
  totalCount: number;
  items: RawItem[];
  truncated: boolean;
}

// 순차로 페이지를 소진한다. 재시도는 call(client) 내부에 있으므로 여기서는 다루지 않는다.
export async function fetchAllPages(
  call: PageCaller,
  op: string,
  params: Params,
  opts: { pageSize: number; maxPages: number },
): Promise<PagedResult> {
  const items: RawItem[] = [];
  let totalCount = 0;
  for (let page = 1; page <= opts.maxPages; page++) {
    const r = await call(op, { ...params, pageNo: page, numOfRows: opts.pageSize });
    totalCount = r.totalCount;
    items.push(...r.items);
    if (items.length >= totalCount || r.items.length === 0) {
      return { totalCount, items, truncated: false };
    }
  }
  return { totalCount, items, truncated: true };
}
