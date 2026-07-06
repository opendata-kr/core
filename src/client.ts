import { resolveConfig } from "./config.js";
import { normalizeResultCode, DataGoKrError } from "./errors.js";
import { normalizeItems, type OperationResult, type RawApiResponse } from "./envelope.js";

export interface CreateClientOptions {
  path: string;
  baseURL?: string;
  serviceKey?: string;
  params?: Record<string, string | number>;
  timeout?: number;
  fetch?: typeof fetch;
}

export type Params = Record<string, string | number | undefined>;

export interface DataGoKrClient {
  call(operation: string, params?: Params): Promise<OperationResult>;
  readonly serviceKeyLooksPreEncoded: boolean;
}

export function createClient(options: CreateClientOptions): DataGoKrClient {
  const { baseURL, serviceKey, serviceKeyLooksPreEncoded } = resolveConfig(process.env, {
    baseURL: options.baseURL,
    serviceKey: options.serviceKey,
  });
  const path = "/" + options.path.replace(/^\/+|\/+$/g, "");
  const defaultParams = options.params ?? {};
  const timeout = options.timeout ?? 10_000;
  const fetchFn = options.fetch ?? fetch;

  function buildUrl(operation: string, params: Params): string {
    const op = operation.replace(/^\/+/, "");
    const qs = new URLSearchParams();
    qs.set("serviceKey", serviceKey);
    for (const [k, v] of Object.entries({ ...defaultParams, ...params })) {
      if (v === undefined) continue;
      qs.set(k, String(v));
    }
    return `${baseURL}${path}/${op}?${qs.toString()}`;
  }

  function handleNonJson(text: string, params: Params): OperationResult {
    const m = text.match(/<returnReasonCode>(\d+)<\/returnReasonCode>/);
    if (m) {
      const code = m[1]!;
      const am = text.match(/<returnAuthMsg>([^<]*)<\/returnAuthMsg>/);
      const norm = normalizeResultCode(code, am?.[1]);
      if (norm.error) throw norm.error;
      if (norm.noData) {
        const pageNo = params.pageNo !== undefined ? Number(params.pageNo) : 1;
        return { totalCount: 0, pageNo, items: [] };
      }
      throw new DataGoKrError(code, "응답을 처리할 수 없습니다");
    }
    throw new Error(`data.go.kr 응답을 JSON으로 해석할 수 없습니다: ${text.trim().slice(0, 200)}`);
  }

  async function call(operation: string, params: Params = {}): Promise<OperationResult> {
    const url = buildUrl(operation, params);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    let res: Response;
    try {
      res = await fetchFn(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      throw new Error(`data.go.kr HTTP ${res.status} 오류 (operation=${operation})`);
    }
    const text = await res.text();
    let json: RawApiResponse;
    try {
      json = JSON.parse(text) as RawApiResponse;
    } catch {
      return handleNonJson(text, params);
    }
    const header = json.response?.header;
    const norm = normalizeResultCode(header?.resultCode ?? "", header?.resultMsg);
    if (norm.error) throw norm.error;
    const body = json.response?.body;
    return {
      totalCount: body?.totalCount ?? 0,
      pageNo: body?.pageNo ?? 1,
      items: norm.noData ? [] : normalizeItems(body?.items),
    };
  }

  return { call, serviceKeyLooksPreEncoded };
}
