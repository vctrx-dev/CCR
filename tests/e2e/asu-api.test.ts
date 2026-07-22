import { describe, expect, it } from "vitest";
import { createAsuAimlProvider, createAsuAimlProviderConfig } from "../../src/llm/asu-api";

const apiKey = (process.env.ASU_API_KEY ?? "").trim();
const model = (process.env.ASU_MODEL ?? "").trim();
const hasCredentials = Boolean(apiKey && model);

describe.runIf(hasCredentials)("ASU AIML API real request", () => {
  it("should make a real chat completion request and return a valid response", async () => {
    const provider = createAsuAimlProvider(
      createAsuAimlProviderConfig({
        apiKey: apiKey,
        model: model,
        baseUrl: process.env.ASU_BASE_URL || undefined,
        modelProvider: process.env.ASU_MODEL_PROVIDER || undefined,
        temperature: 0.1,
        timeoutMs: 60000,
      }),
    );

    const result = await provider.review({
      messages: [
        { role: "system", content: "You are a helpful assistant. Respond with exactly one word." },
        { role: "user", content: "Say hello." },
      ],
    });

    const output = typeof result === "string" ? result : result.output;
    expect(output).toBeTruthy();
    expect(output.length).toBeGreaterThan(0);
  }, 120000);

  it("should fail with a clear error for an invalid API key", async () => {
    const provider = createAsuAimlProvider(
      createAsuAimlProviderConfig({
        apiKey: "invalid-key-12345",
        model: model,
        timeoutMs: 30000,
      }),
    );

    await expect(
      provider.review({
        messages: [{ role: "user", content: "This should fail." }],
      }),
    ).rejects.toThrow();
  }, 60000);
});

describe.skipIf(hasCredentials)("ASU AIML API real request", () => {
  it("should be skipped when ASU_API_KEY / ASU_MODEL are not set", () => {
    expect(apiKey).toBeFalsy();
    expect(model).toBeFalsy();
  });
});
