import type { RawItem } from "./envelope.js";
import type { Params } from "./client.js";
import { mapWithConcurrency } from "./concurrency.js";
import { fetchAllPages, type PageCaller } from "./paginate.js";
import type { DateWindow } from "./windows.js";

export interface FailedWindow {
  window: DateWindow;
  error: string;
}

export interface WindowedResult {
  totalCount: number;
  items: RawItem[];
  truncated: boolean;
  failedWindows: FailedWindow[];
}

// 날짜 창들을 concurrency 제한 하에 병렬로 돌린다. 각 창은 inqryBgnDt/inqryEndDt로 주입하고
// fetchAllPages로 페이지를 소진한다. 창 하나가 (client 재시도 후에도) 실패하면 그 창만
// failedWindows로 보존하고 나머지 성공 창 결과는 반환한다.
export async function fetchWindows(
  call: PageCaller,
  op: string,
  baseParams: Params,
  windows: readonly DateWindow[],
  opts: { pageSize: number; maxPages: number; concurrency: number },
): Promise<WindowedResult> {
  const settled = await mapWithConcurrency(windows, opts.concurrency, (w) =>
    fetchAllPages(call, op, { ...baseParams, inqryBgnDt: w.bgn, inqryEndDt: w.end }, { pageSize: opts.pageSize, maxPages: opts.maxPages }),
  );

  const items: RawItem[] = [];
  let totalCount = 0;
  let truncated = false;
  const failedWindows: FailedWindow[] = [];

  settled.forEach((s, i) => {
    if (s.status === "fulfilled") {
      items.push(...s.value.items);
      totalCount += s.value.totalCount;
      truncated = truncated || s.value.truncated;
    } else {
      failedWindows.push({ window: windows[i]!, error: s.reason instanceof Error ? s.reason.message : String(s.reason) });
    }
  });

  return { totalCount, items, truncated, failedWindows };
}
