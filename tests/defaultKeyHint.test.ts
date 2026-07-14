import { describe, it, expect, vi } from "vitest";
import { create } from "../src/client.js";

// 구 keyHint.test.ts의 케이스를 기본 onRejected 인터셉터 경유로 이식한다 (AC-7).
// 소비자가 아무 조립 없이 잡은 에러 message에 안내가 이미 부착돼 있어야 한다.

const base = { baseURL: "https://apis.data.go.kr/1230000/ad/S", serviceKey: "a%2Bb" };

const errorBody = (resultCode: string, resultMsg: string) =>
  JSON.stringify({ response: { header: { resultCode, resultMsg } } });

const mockFetch = (body: string) => vi.fn(async () => new Response(body, { status: 200 }));

describe("기본 키 힌트 인터셉터", () => {
  it("get 경로: pre-encoded 키 + 인증류 에러면 message에 Decoding 키 안내 부착", async () => {
    const client = create({
      ...base,
      fetch: mockFetch(errorBody("30", "SERVICE_KEY_IS_NOT_REGISTERED_ERROR")),
    });
    await expect(client.get("op")).rejects.toThrow(/Decoding 인증키/);
  });

  it("paginate 경로: 페이지 호출도 동일 파이프라인이라 안내가 부착된다", async () => {
    const client = create({
      ...base,
      fetch: mockFetch(errorBody("30", "SERVICE_KEY_IS_NOT_REGISTERED_ERROR")),
    });
    await expect(client.paginate("op", { pageSize: 10, maxPages: 2 })).rejects.toThrow(
      /Decoding 인증키/,
    );
  });

  it("pre-encoded 키라도 인증류가 아니면 원문 유지", async () => {
    const client = create({ ...base, fetch: mockFetch(errorBody("07", "입력범위값 초과")) });
    const err = await client.get("op").catch((e: Error) => e);
    expect(err.message).not.toMatch(/Decoding 인증키/);
    expect(err.message).toMatch(/입력범위값 초과/);
  });

  it("pre-encoded가 아니면 인증류 에러라도 원문 유지", async () => {
    const client = create({
      ...base,
      serviceKey: "PLAIN",
      fetch: mockFetch(errorBody("30", "SERVICE_KEY_IS_NOT_REGISTERED_ERROR")),
    });
    const err = await client.get("op").catch((e: Error) => e);
    expect(err.message).not.toMatch(/Decoding 인증키/);
  });
});
