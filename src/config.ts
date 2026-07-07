const DEFAULT_BASE_URL = "https://apis.data.go.kr";
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
  const baseURL = (opts.baseURL ?? env.DATA_GO_KR_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const serviceKeyLooksPreEncoded = /%[0-9A-Fa-f]{2}/.test(serviceKey);

  const envTimeoutRaw = env.DATA_GO_KR_TIMEOUT_MS;
  const envTimeout = envTimeoutRaw !== undefined ? Number(envTimeoutRaw) : NaN;
  const timeout =
    Number.isFinite(envTimeout) && envTimeout > 0
      ? envTimeout
      : (opts.timeout ?? DEFAULT_TIMEOUT_MS);

  return { baseURL, serviceKey, serviceKeyLooksPreEncoded, timeout };
}
