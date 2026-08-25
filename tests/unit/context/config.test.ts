import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONTEXT_CONFIG,
  parseContextConfig,
  resolveContextConfig,
  serializeContextConfig,
  toPublicContextConfig,
  updateContextConfig,
} from "../../../src/context/config";

describe("parseContextConfig", () => {
  it("should accept and preserve the minimal documented defaults", () => {
    const parsed = parseContextConfig(serializeContextConfig(DEFAULT_CONTEXT_CONFIG));

    expect(parsed).toEqual(DEFAULT_CONTEXT_CONFIG);
    expect(toPublicContextConfig(parsed)).toEqual({
      domain: "unspecified",
      hooks: { enabled: true, checkBeforeCommit: true },
      context: { recentJournalEntries: 3, maxCompactionPercent: 25 },
      instructions: { updateClaudeMd: false, updateAgentsMd: false, updateDecisionsMd: false },
    });
    expect(parsed.privacy.excludedPaths).toEqual([]);
  });

  it("should not serialize runtime-only discovery or privacy settings", () => {
    const output = serializeContextConfig(DEFAULT_CONTEXT_CONFIG);

    expect(output).not.toContain("schemaVersion");
    expect(output).not.toContain("discovery");
    expect(output).not.toContain("privacy");
    expect(output).not.toContain("_comment");
    expect(output).not.toContain("_help");
    expect(output).toContain('"hooks": {');
  });

  it("should accept a repository-specific domain", () => {
    expect(
      parseContextConfig(
        JSON.stringify({ ...toPublicContextConfig(DEFAULT_CONTEXT_CONFIG), domain: "civic-tech" }),
      ).domain,
    ).toBe("civic-tech");
  });

  it("should default the decisions update opt-in for existing configuration files", () => {
    const parsed = parseContextConfig(
      JSON.stringify({
        ...toPublicContextConfig(DEFAULT_CONTEXT_CONFIG),
        instructions: { updateClaudeMd: true, updateAgentsMd: false },
      }),
    );

    expect(parsed.instructions).toMatchObject({ updateDecisionsMd: false });
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

    expect(parsed.hooks).toEqual({ enabled: true, checkBeforeCommit: true });
    expect(parsed).not.toHaveProperty("discovery");
    expect(parsed.domain).toBe("education");
    expect(parsed.context.recentJournalEntries).toBe(3);
    expect(parsed.context.maxCompactionPercent).toBe(25);
    expect(parsed.privacy.excludedPaths).toEqual([".env*"]);
    expect(parsed.privacy).not.toHaveProperty("providerPolicy");
  });

  it("should accept and discard the legacy discovery setting", () => {
    const parsed = parseContextConfig(
      JSON.stringify({
        schemaVersion: 2,
        domain: "general",
        discovery: { subagentCount: 4 },
        context: { recentJournalEntries: 3 },
        privacy: { excludedPaths: [] },
        instructions: { updateClaudeMd: false, updateAgentsMd: false },
      }),
    );

    expect(parsed).not.toHaveProperty("discovery");
  });

  it("should reject unknown settings", () => {
    const input = { ...toPublicContextConfig(DEFAULT_CONTEXT_CONFIG), hiddenBehavior: true };
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
    expect(resolved.hooks.checkBeforeCommit).toBe(false);
  });
});

describe("updateContextConfig", () => {
  it("should update supported settings with validated command values", () => {
    expect(
      updateContextConfig(DEFAULT_CONTEXT_CONFIG, "instructions.updateClaudeMd", "true")
        .instructions.updateClaudeMd,
    ).toBe(true);
    expect(
      updateContextConfig(DEFAULT_CONTEXT_CONFIG, "instructions.updateDecisionsMd", "true")
        .instructions,
    ).toMatchObject({ updateDecisionsMd: true });
    expect(
      updateContextConfig(DEFAULT_CONTEXT_CONFIG, "hooks.enabled", "false").hooks.enabled,
    ).toBe(false);
    expect(
      updateContextConfig(DEFAULT_CONTEXT_CONFIG, "hooks.checkBeforeCommit", "false").hooks
        .checkBeforeCommit,
    ).toBe(false);
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
  });

  it("should reject unknown settings and malformed values", () => {
    expect(() => updateContextConfig(DEFAULT_CONTEXT_CONFIG, "unknown", "true")).toThrow(
      /Supported settings/,
    );
    expect(() =>
      updateContextConfig(DEFAULT_CONTEXT_CONFIG, "hooks.checkBeforeCommit", "maybe"),
    ).toThrow(/true or false/);
    expect(() =>
      updateContextConfig(DEFAULT_CONTEXT_CONFIG, "context.maxCompactionPercent", "31"),
    ).toThrow();
  });
});
