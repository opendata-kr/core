// 에러를 표시용 문자열로 축약하는 관용구. 서비스마다 복붙되던 삼항식을 한 곳으로 통일한다.
export function errMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
