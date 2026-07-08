import type { Params } from "./client.js";

// data.go.kr 조회기간 파라미터. YYYYMMDD를 inqryBgnDt/inqryEndDt(시작 0000, 종료 2359)로 만든다.
export function dateRangeParams(startDate?: string, endDate?: string): Params {
  const p: Params = {};
  if (startDate) p.inqryBgnDt = `${startDate}0000`;
  if (endDate) p.inqryEndDt = `${endDate}2359`;
  return p;
}

// data.go.kr 페이징 파라미터. 기본 pageNo 1·numOfRows 10.
export function pagingParams(page?: number, pageSize?: number): Params {
  return { pageNo: page ?? 1, numOfRows: pageSize ?? 10 };
}
