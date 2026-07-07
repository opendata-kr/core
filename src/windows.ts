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

// YYYYMMDD 구간을 maxDays 단위 창으로 분할한다. 각 창은 시작 0000, 종료 2359 시각을 붙인다
// (data.go.kr inqryBgnDt/inqryEndDt 규약).
export function splitDateWindows(start: string, end: string, maxDays: number): DateWindow[] {
  const windows: DateWindow[] = [];
  let cur = toDate(start);
  const last = toDate(end);
  while (cur <= last) {
    const winEnd = new Date(cur);
    winEnd.setUTCDate(winEnd.getUTCDate() + maxDays - 1);
    const eff = winEnd > last ? last : winEnd;
    windows.push({ bgn: `${fmt(cur)}0000`, end: `${fmt(eff)}2359` });
    cur = new Date(eff);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return windows;
}
