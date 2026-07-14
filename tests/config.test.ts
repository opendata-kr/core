import { describe, it, expect } from "vitest";
import { resolveConfig } from "../src/config.js";

const BASE = "https://apis.data.go.kr/1230000/ad/S";

describe("resolveConfig", () => {
  it("env에서 serviceKey·baseURL을 읽는다", () => {
    const c = resolveConfig({ DATA_GO_KR_SERVICE_KEY: "abc", DATA_GO_KR_BASE_URL: BASE }, {});
    expect(c.serviceKey).toBe("abc");
    expect(c.baseURL).toBe(BASE);
    expect(c.serviceKeyLooksPreEncoded).toBe(false);
  });
  it("opts가 env를 오버라이드한다", () => {
    const c = resolveConfig(
      { DATA_GO_KR_SERVICE_KEY: "env", DATA_GO_KR_BASE_URL: "http://envhost/x" },
      { serviceKey: "opt", baseURL: "http://opthost/svc/" },
    );
    expect(c.serviceKey).toBe("opt");
    expect(c.baseURL).toBe("http://opthost/svc"); // 끝 슬래시 제거
  });
  it("serviceKey가 없으면 throw", () => {
    expect(() => resolveConfig({}, {})).toThrow(/DATA_GO_KR_SERVICE_KEY/);
  });
  it("baseURL이 옵션에도 env에도 없으면 throw (기본 호스트 폴백 없음)", () => {
    expect(() => resolveConfig({ DATA_GO_KR_SERVICE_KEY: "abc" }, {})).toThrow(
      /DATA_GO_KR_BASE_URL/,
    );
  });
  it("%인코딩 패턴이면 preEncoded 플래그", () => {
    const env = { DATA_GO_KR_SERVICE_KEY: "a%2Bb", DATA_GO_KR_BASE_URL: BASE };
    expect(resolveConfig(env, {}).serviceKeyLooksPreEncoded).toBe(true);
  });
});

// 구 env 관례는 호스트만 넣고 서비스 경로를 path 옵션으로 줬다. 신표면은 baseURL이
// 서비스 경로 포함 전체 URL이므로, 호스트 전용 값을 create 시점에 잡아 회복 지시를 준다.
describe("resolveConfig baseURL 경로 검증", () => {
  const key = { DATA_GO_KR_SERVICE_KEY: "k" };

  it("경로 없는 호스트 전용 baseURL은 즉시 throw", () => {
    expect(() =>
      resolveConfig({ ...key, DATA_GO_KR_BASE_URL: "https://apis.data.go.kr" }, {}),
    ).toThrow(/서비스 경로를 포함한 전체 URL/);
  });

  it("끝 슬래시만 붙은 호스트 전용 baseURL도 throw", () => {
    expect(() => resolveConfig(key, { baseURL: "https://apis.data.go.kr/" })).toThrow(
      /서비스 경로를 포함한 전체 URL/,
    );
  });

  it("URL로 해석할 수 없는 baseURL도 같은 안내로 throw", () => {
    expect(() => resolveConfig(key, { baseURL: "apis.data.go.kr/1230000/ad/S" })).toThrow(
      /서비스 경로를 포함한 전체 URL/,
    );
  });

  it("서비스 경로가 있는 baseURL은 통과", () => {
    expect(resolveConfig(key, { baseURL: BASE }).baseURL).toBe(BASE);
  });
});

describe("resolveConfig timeout", () => {
  const base = {
    DATA_GO_KR_SERVICE_KEY: "k",
    DATA_GO_KR_BASE_URL: BASE,
  } as NodeJS.ProcessEnv;
  it("기본 30초", () => {
    expect(resolveConfig(base, {}).timeout).toBe(30_000);
  });
  it("옵션이 기본을 이김", () => {
    expect(resolveConfig(base, { timeout: 5000 }).timeout).toBe(5000);
  });
  it("env가 옵션을 이김", () => {
    const env = { ...base, DATA_GO_KR_TIMEOUT_MS: "45000" };
    expect(resolveConfig(env, { timeout: 5000 }).timeout).toBe(45_000);
  });
  it("잘못된 env는 무시하고 옵션/기본으로", () => {
    const env = { ...base, DATA_GO_KR_TIMEOUT_MS: "abc" };
    expect(resolveConfig(env, {}).timeout).toBe(30_000);
  });
});
