const DEFAULT_TIMEOUT_MS = 30_000;

export interface ResolvedConfig {
  baseURL: string;
  serviceKey: string;
  serviceKeyLooksPreEncoded: boolean;
  timeout: number;
}

export function resolveConfig(
  env: NodeJS.ProcessEnv,
  opts: { baseURL?: string; serviceKey?: string; timeout?: number },
): ResolvedConfig {
  const serviceKey = (opts.serviceKey ?? env.DATA_GO_KR_SERVICE_KEY)?.trim();
  if (!serviceKey) {
    throw new Error(
      "data.go.kr 서비스키가 없습니다. 옵션 serviceKey 또는 환경변수 DATA_GO_KR_SERVICE_KEY(공공데이터포털 Decoding 키)를 설정하세요.",
    );
  }
  // 기본 호스트 상수는 두지 않는다. 경로 없는 호스트만으로는 유효한 호출 대상이 못 되므로
  // 서비스 경로를 포함한 전체 URL을 옵션 또는 env로 반드시 받는다.
  const baseURLRaw = opts.baseURL ?? env.DATA_GO_KR_BASE_URL;
  if (!baseURLRaw) {
    throw new Error(
      "data.go.kr 기본 URL이 없습니다. 옵션 baseURL 또는 환경변수 DATA_GO_KR_BASE_URL(서비스 경로 포함 전체 URL, 예: https://apis.data.go.kr/1230000/ad/BidPublicInfoService)을 설정하세요.",
    );
  }
  const baseURL = baseURLRaw.replace(/\/+$/, "");
  const serviceKeyLooksPreEncoded = /%[0-9A-Fa-f]{2}/.test(serviceKey);

  const envTimeoutRaw = env.DATA_GO_KR_TIMEOUT_MS;
  const envTimeout = envTimeoutRaw !== undefined ? Number(envTimeoutRaw) : NaN;
  const timeout =
    Number.isFinite(envTimeout) && envTimeout > 0
      ? envTimeout
      : (opts.timeout ?? DEFAULT_TIMEOUT_MS);

  return { baseURL, serviceKey, serviceKeyLooksPreEncoded, timeout };
}
