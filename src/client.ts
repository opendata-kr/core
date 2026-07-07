import { resolveConfig } from "./config.js";
import { normalizeResultCode, DataGoKrError } from "./errors.js";
import { normalizeItems, type OperationResult, type RawApiResponse } from "./envelope.js";

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  jitterMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface CreateClientOptions {
  path: string;
  baseURL?: string;
  serviceKey?: string;
  params?: Record<string, string | number>;
  timeout?: number;
  retry?: RetryOptions;
  fetch?: typeof fetch;
}

export type Params = Record<string, string | number | undefined>;

export interface DataGoKrClient {
  call(operation: string, params?: Params): Promise<OperationResult>;
  readonly serviceKeyLooksPreEncoded: boolean;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function isAbort(e: unknown): boolean {
  return e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError");
}

export function createClient(options: CreateClientOptions): DataGoKrClient {
  const { baseURL, serviceKey, serviceKeyLooksPreEncoded, timeout } = resolveConfig(process.env, {
    baseURL: options.baseURL,
    serviceKey: options.serviceKey,
    timeout: options.timeout,
  });
  const path = "/" + options.path.replace(/^\/+|\/+$/g, "");
  const defaultParams = options.params ?? {};
  const fetchFn = options.fetch ?? fetch;
  const retry = {
    retries: options.retry?.retries ?? 1,
    baseDelayMs: options.retry?.baseDelayMs ?? 300,
    jitterMs: options.retry?.jitterMs ?? 300,
    sleep: options.retry?.sleep ?? defaultSleep,
  };

  function buildUrl(operation: string, params: Params): string {
    const op = operation.replace(/^\/+|\/+$/g, "");
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...defaultParams, ...params })) {
      if (v === undefined) continue;
      qs.set(k, String(v));
    }
    qs.set("serviceKey", serviceKey);
    return `${baseURL}${path}/${op}?${qs.toString()}`;
  }

  function handleNonJson(text: string, params: Params): OperationResult {
    const m = text.match(/<returnReasonCode>(\d+)<\/returnReasonCode>/);
    if (m) {
      const code = m[1]!;
      const am = text.match(/<returnAuthMsg>([^<]*)<\/returnAuthMsg>/);
      const norm = normalizeResultCode(code, am?.[1]);
      if (norm.error) throw new DataGoKrError(norm.error.code, norm.error.resultMsg, { kind: norm.error.kind, rawBody: text.slice(0, 300) });
      if (norm.noData) {
        const pageNo = Number(params.pageNo ?? defaultParams.pageNo ?? 1);
        return { totalCount: 0, pageNo, items: [] };
      }
    }
    throw new DataGoKrError("", "응답을 JSON으로 해석할 수 없습니다", { kind: "unknown", rawBody: text.trim().slice(0, 300) });
  }

  async function callOnce(operation: string, params: Params): Promise<OperationResult> {
    const url = buildUrl(operation, params);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    let res: Response;
    try {
      res = await fetchFn(url, { signal: controller.signal });
    } catch (e) {
      if (isAbort(e)) throw new DataGoKrError("", `요청 시간 초과 (${timeout}ms, operation=${operation})`, { kind: "network" });
      throw new DataGoKrError("", `네트워크 오류 (operation=${operation}): ${e instanceof Error ? e.message : String(e)}`, { kind: "network" });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new DataGoKrError("", `data.go.kr HTTP ${res.status} 오류 (operation=${operation})`, { kind: "unknown", httpStatus: res.status, rawBody: body.slice(0, 300) });
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
    if (norm.error) throw new DataGoKrError(norm.error.code, norm.error.resultMsg, { kind: norm.error.kind, rawBody: text.slice(0, 300) });
    const bodyOut = json.response?.body;
    return {
      totalCount: bodyOut?.totalCount ?? 0,
      pageNo: bodyOut?.pageNo ?? 1,
      items: norm.noData ? [] : normalizeItems(bodyOut?.items),
    };
  }

  async function call(operation: string, params: Params = {}): Promise<OperationResult> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await callOnce(operation, params);
      } catch (e) {
        const retryable = e instanceof DataGoKrError ? e.retryable : false;
        if (!retryable || attempt >= retry.retries) throw e;
        await retry.sleep(retry.baseDelayMs + Math.floor(Math.random() * retry.jitterMs));
      }
    }
  }

  return { call, serviceKeyLooksPreEncoded };
}
