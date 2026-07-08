export interface DateWindow {
  bgn: string;
  end: string;
}

function toDate(yyyymmdd: string): Date {
  const y = Number(yyyymmdd.slice(0, 4)), m = Number(yyyymmdd.slice(4, 6)), d = Number(yyyymmdd.slice(6, 8));
  return new Date(Date.UTC(y, m - 1, d));
}

function fmt(dt: Date): string {
  const y = dt.getUTCFullYear(), m = String(dt.getUTCMonth() + 1).padStart(2, "0"), d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

// YYYYMMDD 구간을 캘린더 월 경계로 분할한다. 각 창은 시작 0000, 종료 2359 시각을 붙이고
// 한 달 안에 머문다(data.go.kr 조회기간 한계 "종료일 ≤ 시작일 + 1 캘린더 개월" 충족).
// 고정 일수 창은 2월 낀 구간에서 1개월을 넘겨 resultCode 07을 내므로 월 경계로 자른다.
export function splitCalendarMonths(start: string, end: string): DateWindow[] {
  const windows: DateWindow[] = [];
  let cur = toDate(start);
  const last = toDate(end);
  while (cur <= last) {
    const monthEnd = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 0));
    const eff = monthEnd > last ? last : monthEnd;
    windows.push({ bgn: `${fmt(cur)}0000`, end: `${fmt(eff)}2359` });
    cur = new Date(eff);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return windows;
}
