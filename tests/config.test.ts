import { describe, it, expect } from "vitest";
import { resolveConfig } from "../src/config.js";

describe("resolveConfig", () => {
  it("env에서 serviceKey를 읽고 baseURL 기본값을 준다", () => {
    const c = resolveConfig({ DATA_GO_KR_SERVICE_KEY: "abc" }, {});
    expect(c.serviceKey).toBe("abc");
    expect(c.baseURL).toBe("https://apis.data.go.kr");
    expect(c.serviceKeyLooksPreEncoded).toBe(false);
  });
  it("opts가 env를 오버라이드한다", () => {
    const c = resolveConfig(
      { DATA_GO_KR_SERVICE_KEY: "env", DATA_GO_KR_BASE_URL: "http://envhost" },
      { serviceKey: "opt", baseURL: "http://opthost/" },
    );
    expect(c.serviceKey).toBe("opt");
    expect(c.baseURL).toBe("http://opthost"); // 끝 슬래시 제거
  });
  it("serviceKey가 없으면 throw", () => {
    expect(() => resolveConfig({}, {})).toThrow(/DATA_GO_KR_SERVICE_KEY/);
  });
  it("%인코딩 패턴이면 preEncoded 플래그", () => {
    expect(resolveConfig({ DATA_GO_KR_SERVICE_KEY: "a%2Bb" }, {}).serviceKeyLooksPreEncoded).toBe(true);
  });
});

describe("resolveConfig timeout", () => {
  const base = { DATA_GO_KR_SERVICE_KEY: "k" } as NodeJS.ProcessEnv;
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
