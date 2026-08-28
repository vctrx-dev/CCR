import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONTEXT_CONFIG,
  createAsuAimlProviderConfig,
  parseReviewDimensionRegistry,
  resolveContextConfig,
  serializeContextConfig,
} from "../../src/index";

describe("public package API", () => {
  it("exposes validated configuration utilities without requiring process state", () => {
    const resolved = resolveContextConfig(DEFAULT_CONTEXT_CONFIG, {
      privacy: { excludedPaths: ["private/**"] },
    });

    expect(resolved.privacy.excludedPaths).toEqual(["private/**"]);
    const serialized = JSON.parse(serializeContextConfig(resolved));
    expect(serialized).toMatchObject({ domain: "unspecified" });
    expect(serialized).not.toHaveProperty("privacy");
  });

  it("exposes provider construction and taxonomy validation through the package root", () => {
    const providerConfig = createAsuAimlProviderConfig({
      apiKey: "test-key",
      model: "gpt-5.2",
    });
    const registry = parseReviewDimensionRegistry({
      dimensions: [
        {
          id: "quality",
          name: "Quality",
          summary: "Checks observable product quality.",
          criteria: [
            {
              id: "behavior",
              name: "Behavior",
              details: "Review externally visible behavior.",
            },
          ],
        },
      ],
    });

    expect(providerConfig.baseUrl).toBe("https://api-main.aiml.asu.edu/queryV2");
    expect(registry.dimensions[0]?.id).toBe("quality");
  });
});
