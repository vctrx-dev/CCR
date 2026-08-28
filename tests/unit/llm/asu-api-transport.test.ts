import { afterEach, describe, expect, it, vi } from "vitest";
import { sendAsuAimlRequest } from "../../../src/llm/asu-api-transport";
import type { AsuAimlProviderConfig } from "../../../src/llm/types";

const config: AsuAimlProviderConfig = {
  apiKey: "test-key",
  baseUrl: "https://example.com/query",
  model: "gpt-5.2",
  modelProvider: "openai",
  temperature: 0.2,
  timeoutMs: 50,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ASU AIML request transport", () => {
  it("should send an adapter-owned body and normalize a successful provider response", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ response: "completed" }), { status: 200 }));

    await expect(
      sendAsuAimlRequest(config, {
        action: "query",
        model_name: config.model,
        query: "Review this diff",
      }),
    ).resolves.toMatchObject({ output: "completed" });

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(fetchSpy).toHaveBeenCalledWith(
      config.baseUrl,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-key" }),
        method: "POST",
      }),
    );
  });
});
