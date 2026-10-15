import { afterEach, describe, expect, it, vi } from "vitest";
import { requestAsuAimlChatCompletion } from "../../../src/llm/asu-api";
import type { AsuAimlProviderConfig } from "../../../src/llm/types";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function getRequestError(request: Promise<unknown>): Promise<Error> {
  try {
    await request;
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }

    throw new Error("Expected the request to fail with an Error.");
  }

  throw new Error("Expected the request to fail.");
}

describe("requestAsuAimlChatCompletion", () => {
  it("does not send a bearer credential when a caller bypasses config validation", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ response: "should not be read" }), { status: 200 }),
      );
    const config: AsuAimlProviderConfig = {
      apiKey: "test-key",
      baseUrl: "http://localhost:8080/query",
      model: "gpt-5.2",
      modelProvider: "openai",
      temperature: 0.2,
      timeoutMs: 50,
    };

    await expect(
      requestAsuAimlChatCompletion(config, [{ role: "user", content: "Review this diff" }]),
    ).rejects.toThrow("Expected an HTTPS URL.");

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("redacts upstream error bodies from the diagnostic", async () => {
    const secret = "provider-echoed-secret";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(`${secret}${"x".repeat(10_000)}`, { status: 400 }),
    );
    const config: AsuAimlProviderConfig = {
      apiKey: "test-key",
      baseUrl: "https://example.com/query",
      model: "gpt-5.2",
      modelProvider: "openai",
      temperature: 0.2,
      timeoutMs: 50,
    };

    const error = await getRequestError(
      requestAsuAimlChatCompletion(config, [{ role: "user", content: "Review this diff" }]),
    );

    expect(error.message).toBe("ASU AIML request failed with status 400.");
    expect(error.message).not.toContain(secret);
    expect(error.message.length).toBeLessThan(100);
  });

  it("caps a server retry delay and stops when the retry window would expire", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response("temporary service failure", {
          status: 503,
          headers: { "Retry-After": "3600" },
        }),
    );
    const config: AsuAimlProviderConfig = {
      apiKey: "test-key",
      baseUrl: "https://example.com/query",
      model: "gpt-5.2",
      modelProvider: "openai",
      temperature: 0.2,
      timeoutMs: 50,
    };

    const request = requestAsuAimlChatCompletion(config, [
      { role: "user", content: "Review this diff" },
    ]);
    const result = getRequestError(request);

    await vi.runAllTimersAsync();

    const error = await result;

    expect(error.message).toContain("status 503");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
