import { afterEach, describe, expect, it, vi } from "vitest";
import { requestAsuAimlChatCompletion } from "../../../src/llm/asu-api";
import type { AsuAimlProviderConfig } from "../../../src/llm/types";

afterEach(() => {
  vi.restoreAllMocks();
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
