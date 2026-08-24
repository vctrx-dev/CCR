import { afterEach, describe, expect, it, vi } from "vitest";
import { createAsuAimlProvider, requestAsuAimlChatCompletion } from "../../../src/llm/asu-api";
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
  it("should wrap a provider request failure at the ReviewProvider boundary", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("invalid", { status: 400 }));
    const provider = createAsuAimlProvider({
      apiKey: "test-key",
      baseUrl: "https://example.com/query",
      model: "gpt-5.2",
      modelProvider: "openai",
      temperature: 0.2,
      timeoutMs: 50,
    });

    await expect(
      provider.review({ messages: [{ role: "user", content: "Review this diff" }] }),
    ).rejects.toThrow(
      "Unable to complete the review request: ASU AIML request failed with status 400.",
    );
  });

  it("fails fast when ASU returns a project rate-limit response", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          message: "Rate limit for project has exceeded. Try again later.",
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    const config: AsuAimlProviderConfig = {
      apiKey: "test-key",
      baseUrl: "https://example.com/query",
      model: "gpt-5.2",
      modelProvider: "openai",
      temperature: 0.2,
      timeoutMs: 50,
    };

    await expect(
      requestAsuAimlChatCompletion(config, [
        { role: "system", content: "System instructions" },
        { role: "user", content: "Review this diff" },
      ]),
    ).rejects.toThrow("ASU AIML request failed with status 500.");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

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

  it("does not send a bearer credential to a credential-bearing HTTPS endpoint", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ response: "should not be read" }), { status: 200 }),
      );
    const config: AsuAimlProviderConfig = {
      apiKey: "test-key",
      baseUrl: "https://username:password@example.com/query",
      model: "gpt-5.2",
      modelProvider: "openai",
      temperature: 0.2,
      timeoutMs: 50,
    };

    await expect(
      requestAsuAimlChatCompletion(config, [{ role: "user", content: "Review this diff" }]),
    ).rejects.toThrow("ASU AIML endpoint URL must not include credentials.");

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

  it.each([
    { name: "malformed", rawBody: "not json" },
    { name: "unsupported", rawBody: JSON.stringify({ error: "provider-echoed-secret" }) },
  ])("does not retry or echo a $name successful provider response", async ({ rawBody }) => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response(rawBody, { status: 200 }));
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

    expect(error.message).toBe("Unexpected ASU AIML response format.");
    expect(error.message).not.toContain(rawBody);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("does not expose a transport error message after retrying", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const secret = "https://username:password@provider.example.com";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error(secret));
    const config: AsuAimlProviderConfig = {
      apiKey: "test-key",
      baseUrl: "https://example.com/query",
      model: "gpt-5.2",
      modelProvider: "openai",
      temperature: 0.2,
      timeoutMs: 50,
    };

    const rejection = getRequestError(
      requestAsuAimlChatCompletion(config, [{ role: "user", content: "Review this diff" }]),
    );
    await vi.runAllTimersAsync();

    const error = await rejection;

    expect(error.message).toBe(
      "ASU AIML request failed after 3 attempts: ASU AIML provider connection failed.",
    );
    expect(error.message).not.toContain(secret);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("rejects an oversized successful response without retrying or exposing its content", async () => {
    const secret = "provider-echoed-secret";
    const response = new Response(`${secret}${"x".repeat(1_048_576)}`, { status: 200 });
    const textSpy = vi.spyOn(response, "text");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
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

    expect(error.message).toBe("ASU AIML response body exceeds the 1048576-byte limit.");
    expect(error.message).not.toContain(secret);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(textSpy).not.toHaveBeenCalled();
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

  it("applies bounded jitter to exponential retry delays", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("temporary service failure", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ response: "completed" }), { status: 200 }),
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

    await vi.advanceTimersByTimeAsync(2_000);

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(200);

    await expect(request).resolves.toMatchObject({ output: "completed" });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it.each([400, 401, 403, 404, 408, 422])(
    "should make exactly one request for non-retryable client error %s",
    async (status) => {
      vi.useFakeTimers();
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response("invalid request", { status }));
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
      const rejection = expect(request).rejects.toThrow(new RegExp(`status ${status}`));
      await vi.runAllTimersAsync();

      await rejection;
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    },
  );

  it("throws on empty user messages", async () => {
    const config: AsuAimlProviderConfig = {
      apiKey: "test-key",
      baseUrl: "https://example.com/query",
      model: "gpt-5.2",
      modelProvider: "openai",
      temperature: 0.2,
      timeoutMs: 50,
    };

    await expect(
      requestAsuAimlChatCompletion(config, [{ role: "system", content: "System instructions" }]),
    ).rejects.toThrow("No user message found");
  });
});
