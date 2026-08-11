import { afterEach, describe, expect, it, vi } from "vitest";
import { requestAsuAimlChatCompletion } from "../../../src/llm/asu-api";
import type { AsuAimlProviderConfig } from "../../../src/llm/types";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("requestAsuAimlChatCompletion", () => {
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
    ).rejects.toThrow(/Rate limit for project has exceeded/);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
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
