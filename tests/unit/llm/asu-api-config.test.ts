import { afterEach, describe, expect, it } from "vitest";
import {
  createAsuAimlProviderConfig,
  estimateCostUsd,
  readAsuAimlProviderConfig,
} from "../../../src/llm/asu-api-config";

const originalEnv = process.env;

afterEach(() => {
  process.env = originalEnv;
});

describe("createAsuAimlProviderConfig", () => {
  it("should apply defaults for optional fields", () => {
    const config = createAsuAimlProviderConfig({
      apiKey: "key-123",
      model: "gpt-5.2",
    });

    expect(config.apiKey).toBe("key-123");
    expect(config.model).toBe("gpt-5.2");
    expect(config.baseUrl).toBe("https://api-main.aiml.asu.edu/queryV2");
    expect(config.modelProvider).toBe("openai");
    expect(config.temperature).toBe(0.2);
    expect(config.timeoutMs).toBe(120000);
  });

  it("accepts explicit overrides", () => {
    const config = createAsuAimlProviderConfig({
      apiKey: "key-456",
      model: "claude4_5_sonnet",
      baseUrl: "https://custom.example.com/query",
      modelProvider: "aws",
      temperature: 0.5,
      timeoutMs: 30000,
    });

    expect(config.apiKey).toBe("key-456");
    expect(config.baseUrl).toBe("https://custom.example.com/query");
    expect(config.modelProvider).toBe("aws");
    expect(config.temperature).toBe(0.5);
    expect(config.timeoutMs).toBe(30000);
  });

  it("should trim whitespace from apiKey and model", () => {
    const config = createAsuAimlProviderConfig({
      apiKey: "  key-789  ",
      model: "  gpt-5  ",
    });

    expect(config.apiKey).toBe("key-789");
    expect(config.model).toBe("gpt-5");
  });

  it("throws when apiKey is empty", () => {
    expect(() => createAsuAimlProviderConfig({ apiKey: "", model: "gpt-5" })).toThrow(
      "apiKey must not be empty.",
    );
  });

  it("throws when model is empty", () => {
    expect(() => createAsuAimlProviderConfig({ apiKey: "key", model: "" })).toThrow(
      "model must not be empty.",
    );
  });
});

describe("readAsuAimlProviderConfig", () => {
  it("should read from environment variables with defaults", () => {
    process.env = {
      ...originalEnv,
      ASU_API_KEY: "env-key",
      ASU_MODEL: "gpt-5.2",
    };

    const config = readAsuAimlProviderConfig(process.env);
    expect(config.apiKey).toBe("env-key");
    expect(config.model).toBe("gpt-5.2");
    expect(config.baseUrl).toBe("https://api-main.aiml.asu.edu/queryV2");
    expect(config.modelProvider).toBe("openai");
  });

  it("should read optional env vars when set", () => {
    process.env = {
      ...originalEnv,
      ASU_API_KEY: "env-key",
      ASU_MODEL: "gpt-5.2",
      ASU_BASE_URL: "https://beta.example.com",
      ASU_MODEL_PROVIDER: "aws",
      ASU_TEMPERATURE: "0.7",
      ASU_TIMEOUT_MS: "60000",
    };

    const config = readAsuAimlProviderConfig(process.env);
    expect(config.baseUrl).toBe("https://beta.example.com");
    expect(config.modelProvider).toBe("aws");
    expect(config.temperature).toBe(0.7);
    expect(config.timeoutMs).toBe(60000);
  });

  it("throws when ASU_API_KEY is missing", () => {
    process.env = { ...originalEnv, ASU_API_KEY: "", ASU_MODEL: "gpt-5" };
    expect(() => readAsuAimlProviderConfig(process.env)).toThrow(
      "ASU_API_KEY and ASU_MODEL are required",
    );
  });

  it("throws when ASU_MODEL is missing", () => {
    process.env = { ...originalEnv, ASU_API_KEY: "key", ASU_MODEL: "" };
    expect(() => readAsuAimlProviderConfig(process.env)).toThrow(
      "ASU_API_KEY and ASU_MODEL are required",
    );
  });
});

describe("estimateCostUsd", () => {
  it("returns 0 for zero tokens", () => {
    expect(estimateCostUsd(0, 0)).toBe(0);
  });

  it("should calculate cost with default rates", () => {
    const cost = estimateCostUsd(1000, 500);
    expect(cost).toBeGreaterThan(0);
  });
});
