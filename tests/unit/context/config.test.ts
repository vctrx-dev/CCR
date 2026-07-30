import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONTEXT_CONFIG,
  parseContextConfig,
  resolveContextConfig,
  updateContextConfig,
} from "../../../src/context/config";

describe("parseContextConfig", () => {
  it("should accept the documented defaults", () => {
    expect(parseContextConfig(JSON.stringify(DEFAULT_CONTEXT_CONFIG))).toEqual(
      DEFAULT_CONTEXT_CONFIG,
    );
    expect(DEFAULT_CONTEXT_CONFIG.instructions).toMatchObject({
      updateClaudeMd: false,
      updateAgentsMd: false,
    });
    expect(DEFAULT_CONTEXT_CONFIG.domain).toBe("unspecified");
    expect(DEFAULT_CONTEXT_CONFIG._comment).toMatch(/human-owned/i);
    expect(DEFAULT_CONTEXT_CONFIG._help["context.maxCompactionPercent"]).toMatch(/integer.*20-30/i);
    expect(DEFAULT_CONTEXT_CONFIG.discovery.subagentCount).toBe(3);
    expect(DEFAULT_CONTEXT_CONFIG.context.maxCompactionPercent).toBe(25);
    expect(DEFAULT_CONTEXT_CONFIG.privacy).not.toHaveProperty("providerPolicy");
    expect(DEFAULT_CONTEXT_CONFIG.privacy.excludedPaths).toEqual(
      expect.arrayContaining([
        ".env*",
        "**/.env*",
        "**/secrets/**",
        "**/credentials/**",
        "**/*.pem",
        "**/*.key",
      ]),
    );
    expect(DEFAULT_CONTEXT_CONFIG.context).not.toHaveProperty("maxIndexCharacters");
    expect(DEFAULT_CONTEXT_CONFIG.context).not.toHaveProperty("maxFileCharacters");
  });

  it("should accept a repository-specific domain", () => {
    expect(
      parseContextConfig(
        JSON.stringify({ ...DEFAULT_CONTEXT_CONFIG, domain: "civic-tech/elections" }),
      ).domain,
    ).toBe("civic-tech/elections");
  });

  it("should migrate supported settings from the previous schema", () => {
    const parsed = parseContextConfig(
      JSON.stringify({
        schemaVersion: 1,
        domain: "education",
        automation: { mode: "warn", checkBeforeCommit: true },
        context: {
          maxIndexCharacters: 6000,
          maxFileCharacters: 10_000,
          recentJournalEntries: 3,
        },
        privacy: {
          providerPolicy: "claude-code-only",
          excludedPaths: [".env*"],
        },
        instructions: { updateClaudeMd: false, updateAgentsMd: false },
      }),
    );

    expect(parsed.schemaVersion).toBe(2);
    expect(parsed._comment).toMatch(/human-owned/i);
    expect(parsed.discovery.subagentCount).toBe(3);
    expect(parsed.domain).toBe("education");
    expect(parsed.context.recentJournalEntries).toBe(3);
    expect(parsed.context.maxCompactionPercent).toBe(25);
    expect(parsed.privacy.excludedPaths).toEqual(DEFAULT_CONTEXT_CONFIG.privacy.excludedPaths);
    expect(parsed.privacy).not.toHaveProperty("providerPolicy");
  });

  it("should reject unknown settings", () => {
    const input = { ...DEFAULT_CONTEXT_CONFIG, hiddenBehavior: true };
    expect(() => parseContextConfig(JSON.stringify(input))).toThrow(/hiddenBehavior/);
  });
});

describe("resolveContextConfig", () => {
  it("should let local settings add exclusions without removing team exclusions", () => {
    const resolved = resolveContextConfig(DEFAULT_CONTEXT_CONFIG, {
      privacy: { excludedPaths: ["private/**"] },
      automation: { checkBeforeCommit: false },
    });

    expect(resolved.privacy.excludedPaths).toEqual([
      ...DEFAULT_CONTEXT_CONFIG.privacy.excludedPaths,
      "private/**",
    ]);
    expect(resolved.automation.checkBeforeCommit).toBe(false);
  });
});

describe("updateContextConfig", () => {
  it("should update supported settings with validated command values", () => {
    expect(
      updateContextConfig(DEFAULT_CONTEXT_CONFIG, "instructions.updateClaudeMd", "true")
        .instructions.updateClaudeMd,
    ).toBe(true);
    expect(
      updateContextConfig(DEFAULT_CONTEXT_CONFIG, "context.recentJournalEntries", "2").context
        .recentJournalEntries,
    ).toBe(2);
    expect(
      updateContextConfig(DEFAULT_CONTEXT_CONFIG, "context.maxCompactionPercent", "30").context
        .maxCompactionPercent,
    ).toBe(30);
    expect(updateContextConfig(DEFAULT_CONTEXT_CONFIG, "domain", "civic-tech").domain).toBe(
      "civic-tech",
    );
    expect(
      updateContextConfig(DEFAULT_CONTEXT_CONFIG, "discovery.subagentCount", "4").discovery
        .subagentCount,
    ).toBe(4);
  });

  it("should reject unknown settings and malformed values", () => {
    expect(() => updateContextConfig(DEFAULT_CONTEXT_CONFIG, "unknown", "true")).toThrow(
      /Supported settings/,
    );
    expect(() =>
      updateContextConfig(DEFAULT_CONTEXT_CONFIG, "automation.checkBeforeCommit", "maybe"),
    ).toThrow(/true or false/);
    expect(() =>
      updateContextConfig(DEFAULT_CONTEXT_CONFIG, "context.maxCompactionPercent", "31"),
    ).toThrow();
  });
});
