import { describe, expect, it } from "vitest";
import type {
  AsuAimlProviderConfig,
  ReviewProvider,
  ReviewProviderResult,
} from "../../../src/llm/types";

describe("LLM types", () => {
  it("should satisfy the contract for ReviewProvider", () => {
    const provider: ReviewProvider = {
      async review() {
        return { output: "test" };
      },
    };
    expect(provider).toBeDefined();
  });

  it("should satisfy the contract for ReviewProviderResult with usage", () => {
    const result: ReviewProviderResult = {
      output: "review output",
      usage: {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      },
    };
    expect(result.output).toBe("review output");
    expect(result.usage?.totalTokens).toBe(150);
  });

  it("should satisfy the contract for AsuAimlProviderConfig", () => {
    const config: AsuAimlProviderConfig = {
      apiKey: "test-key",
      baseUrl: "https://example.com/query",
      modelProvider: "openai",
      model: "gpt-5.2",
      temperature: 0.2,
      timeoutMs: 5000,
    };
    expect(config.apiKey).toBe("test-key");
    expect(config.model).toBe("gpt-5.2");
  });
});
