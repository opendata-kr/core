import type { DateWindow } from "./windows.js";

// 스키마 검증에서 탈락해 data 대신 격리된 item.
export interface InvalidItem {
  // 그 호출이 수신한 전체 item 시퀀스의 0기반 누적 위치 (페이지 내 위치가 아님).
  index: number;
  issues: string[];
  raw: unknown;
}

export interface DataGoKrResponse<T = Record<string, unknown>> {
  data: T[];
  totalCount: number;
  pageNo: number;
  invalid: InvalidItem[];
}

export interface PaginatedResponse<T> extends DataGoKrResponse<T> {
  // maxPages 소진으로 전체 결과를 다 받지 못했으면 true.
  truncated: boolean;
}

export interface FailedWindow {
  window: DateWindow;
  error: string;
}

export interface WindowedResponse<T> extends PaginatedResponse<T> {
  // 재시도 후에도 실패한 창. 성공 창 결과는 유지되고 실패 창만 여기로 격리된다.
  failedWindows: FailedWindow[];
}
