import type { DataGoKrClient } from "./client.js";

// 인증류 에러 메시지(HTTP 401/403, resultCode 3x, SERVICE_KEY, 인증)에 회복 지시를 붙인다.
// Encoding 키를 URL 인코딩하면 이중 인코딩이 되어 인증이 실패하므로 Decoding 키를 쓰라고 안내한다.
const AUTH_LIKE = /HTTP 40[13]|\[3\d\]|SERVICE_KEY|인증/i;

export function withKeyHint(client: Pick<DataGoKrClient, "serviceKeyLooksPreEncoded">, message: string): string {
  if (client.serviceKeyLooksPreEncoded && AUTH_LIKE.test(message)) {
    return message + " (인증 실패 시 Encoding 키의 이중 인코딩일 수 있습니다. data.go.kr의 Decoding 인증키를 DATA_GO_KR_SERVICE_KEY로 사용하세요.)";
  }
  return message;
}
