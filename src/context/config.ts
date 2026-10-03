import { z } from "zod";

/**
 * Human-owned CCR settings. Keep this public shape small; runtime safety defaults belong in the
 * resolved configuration below and must not become user-editable by accident. New configuration
 * behavior belongs here with its schema, defaults, migration, and update path; callers must not
 * parse or mutate CCR configuration independently.
 */

/** Fixed runtime values that are deliberately not written to or read from `.ccr/config.json`. */
const MAX_COMPACTION_PERCENT = 25;
const SHOULD_UPDATE_DECISIONS = true;

const contextSettingsSchema = z
  .object({
    recentJournalEntries: z.number().int().min(1).max(10),
    maxCompactionPercent: z.number().int().min(20).max(30),
  })
  .strict();

const hooksSettingsSchema = z
  .object({
    enabled: z.boolean(),
    checkBeforeCommit: z.boolean(),
    autoUpdateContext: z.boolean(),
  })
  .strict();

const instructionsSchema = z
  .object({
    updateClaudeMd: z.boolean(),
    updateAgentsMd: z.boolean(),
    updateDecisionsMd: z.boolean(),
  })
  .strict();

const privacySettingsSchema = z
  .object({ excludedPaths: z.array(z.string().min(1)).max(100) })
  .strict();

// Keys removed from the public file stay accepted (and ignored) so older files remain valid.
const publicHooksSchema = z
  .object({
    enabled: z.boolean(),
    checkBeforeCommit: z.boolean(),
    autoUpdateContext: z.boolean().optional(),
  })
  .strict();

const publicContextSchema = z
  .object({
    recentJournalEntries: z.number().int().min(1).max(10),
    maxCompactionPercent: z.number().int().min(20).max(30).optional(),
  })
  .strict();

const publicInstructionsSchema = z
  .object({
    updateClaudeMd: z.boolean(),
    updateAgentsMd: z.boolean(),
    updateDecisionsMd: z.boolean().optional(),
  })
  .strict();

const publicConfigSchema = z
  .object({
    domain: z.string().trim().min(1).max(80).default("unspecified"),
    hooks: publicHooksSchema.default({ enabled: true, checkBeforeCommit: true }),
    context: publicContextSchema.default({ recentJournalEntries: 1 }),
    instructions: publicInstructionsSchema.default({
      updateClaudeMd: false,
      updateAgentsMd: false,
    }),
    privacy: privacySettingsSchema.optional(),
  })
  .strict();

const resolvedConfigSchema = z
  .object({
    domain: z.string().trim().min(1).max(80),
    hooks: hooksSettingsSchema,
    context: contextSettingsSchema,
    privacy: privacySettingsSchema,
    instructions: instructionsSchema,
  })
  .strict();

const legacyConfigSchema = z
  .object({
    schemaVersion: z.union([z.literal(1), z.literal(2)]),
    domain: z.string().trim().min(1).max(80),
    hooks: z.boolean().optional(),
    automation: z.object({ checkBeforeCommit: z.boolean() }).passthrough().optional(),
    discovery: z
      .object({ subagentCount: z.number().int().min(1).max(4) })
      .passthrough()
      .optional(),
    context: z
      .object({
        recentJournalEntries: z.number().int().min(1).max(10),
        maxCompactionPercent: z.number().int().min(20).max(30).optional(),
      })
      .passthrough(),
    privacy: z.object({ excludedPaths: z.array(z.string().min(1)).max(100) }).passthrough(),
    instructions: publicInstructionsSchema.passthrough(),
  })
  .passthrough();

const localConfigSchema = z
  .object({
    hooks: z.object({ checkBeforeCommit: z.boolean().optional() }).strict().optional(),
    automation: z.object({ checkBeforeCommit: z.boolean().optional() }).strict().optional(),
    context: z
      .object({ recentJournalEntries: z.number().int().min(1).max(10) })
      .strict()
      .optional(),
    privacy: z
      .object({ excludedPaths: z.array(z.string().min(1)).max(100) })
      .strict()
      .optional(),
  })
  .strict();

export type ContextConfig = z.infer<typeof resolvedConfigSchema>;
export type PublicContextConfig = z.infer<typeof publicConfigSchema>;
export type LocalContextConfig = z.infer<typeof localConfigSchema>;

export const DEFAULT_CONTEXT_CONFIG: ContextConfig = {
  domain: "unspecified",
  // Automatic post-commit updates are derived: on whenever both hook switches are on.
  hooks: { enabled: true, checkBeforeCommit: true, autoUpdateContext: true },
  context: {
    recentJournalEntries: 1,
    maxCompactionPercent: MAX_COMPACTION_PERCENT,
  },
  privacy: { excludedPaths: [] },
  // New setups point Claude Code and other agents at CCR context so journal continuity survives
  // compaction. Human-confirmed review rationale is always shareable through decisions.md.
  instructions: {
    updateClaudeMd: true,
    updateAgentsMd: true,
    updateDecisionsMd: SHOULD_UPDATE_DECISIONS,
  },
};

const UNSPECIFIED_DOMAIN = "unspecified";

/**
 * Applies the values CCR fixes in code: background context updates follow the two hook switches,
 * compaction is capped at 25%, and decision appends stay enabled. Every resolved config passes here.
 */
function withFixedSettings(config: ContextConfig): ContextConfig {
  return resolvedConfigSchema.parse({
    ...config,
    hooks: {
      enabled: config.hooks.enabled,
      checkBeforeCommit: config.hooks.checkBeforeCommit,
      autoUpdateContext: config.hooks.enabled && config.hooks.checkBeforeCommit,
    },
    context: { ...config.context, maxCompactionPercent: MAX_COMPACTION_PERCENT },
    instructions: { ...config.instructions, updateDecisionsMd: SHOULD_UPDATE_DECISIONS },
  });
}

function fromPublicConfig(config: PublicContextConfig): ContextConfig {
  return withFixedSettings({
    ...DEFAULT_CONTEXT_CONFIG,
    domain: config.domain,
    hooks: { ...DEFAULT_CONTEXT_CONFIG.hooks, ...config.hooks },
    context: { ...DEFAULT_CONTEXT_CONFIG.context, ...config.context },
    instructions: { ...DEFAULT_CONTEXT_CONFIG.instructions, ...config.instructions },
    privacy: config.privacy ?? DEFAULT_CONTEXT_CONFIG.privacy,
  });
}

/** Returns only the human-editable settings written to `.ccr/config.json`. */
export function toPublicContextConfig(config: ContextConfig): PublicContextConfig {
  return publicConfigSchema.parse({
    domain: config.domain,
    hooks: { enabled: config.hooks.enabled, checkBeforeCommit: config.hooks.checkBeforeCommit },
    context: { recentJournalEntries: config.context.recentJournalEntries },
    instructions: {
      updateClaudeMd: config.instructions.updateClaudeMd,
      updateAgentsMd: config.instructions.updateAgentsMd,
    },
    // Persist repository-specific restrictions; omitting them would broaden evidence access.
    ...(config.privacy.excludedPaths.length > 0 ? { privacy: config.privacy } : {}),
  });
}

/** Serializes the minimal, strict-JSON configuration file. */
export function serializeContextConfig(config: ContextConfig): string {
  return `${JSON.stringify(toPublicContextConfig(config), null, 2)}\n`;
}

function migrateLegacyConfig(config: z.infer<typeof legacyConfigSchema>): ContextConfig {
  return withFixedSettings({
    ...DEFAULT_CONTEXT_CONFIG,
    domain: config.domain,
    hooks: {
      ...DEFAULT_CONTEXT_CONFIG.hooks,
      enabled: config.hooks ?? true,
      checkBeforeCommit: config.automation?.checkBeforeCommit ?? true,
    },
    context: {
      ...DEFAULT_CONTEXT_CONFIG.context,
      recentJournalEntries: config.context.recentJournalEntries,
    },
    privacy: {
      excludedPaths: [
        ...new Set([
          ...DEFAULT_CONTEXT_CONFIG.privacy.excludedPaths,
          ...config.privacy.excludedPaths,
        ]),
      ],
    },
    instructions: {
      ...DEFAULT_CONTEXT_CONFIG.instructions,
      updateClaudeMd: config.instructions.updateClaudeMd,
      updateAgentsMd: config.instructions.updateAgentsMd,
    },
  });
}

/** Parses the minimal format and migrates supported legacy files in memory. */
export function parseContextConfig(input: string): ContextConfig {
  const value = parseConfigJson(input);
  const current = publicConfigSchema.safeParse(value);
  if (current.success) return fromPublicConfig(current.data);

  const legacy = legacyConfigSchema.safeParse(value);
  if (!legacy.success) throw current.error;
  return migrateLegacyConfig(legacy.data);
}

/** Parses the intentionally limited set of per-developer overrides. */
export function parseLocalContextConfig(input: string): LocalContextConfig {
  return localConfigSchema.parse(parseConfigJson(input));
}

function parseConfigJson(input: string): unknown {
  try {
    const value: unknown = JSON.parse(input);
    return value;
  } catch {
    // Node's SyntaxError may include private input excerpts; never retain it as a cause.
    throw new Error("CCR configuration must be valid JSON.");
  }
}

/** Merges local restrictions without allowing team exclusions to be removed. */
export function resolveContextConfig(
  shared: ContextConfig,
  local: LocalContextConfig = {},
): ContextConfig {
  const excludedPaths = [
    ...new Set([...shared.privacy.excludedPaths, ...(local.privacy?.excludedPaths ?? [])]),
  ];
  return withFixedSettings({
    ...shared,
    hooks: {
      ...shared.hooks,
      checkBeforeCommit:
        local.hooks?.checkBeforeCommit ??
        local.automation?.checkBeforeCommit ??
        shared.hooks.checkBeforeCommit,
    },
    context: {
      ...shared.context,
      recentJournalEntries:
        local.context?.recentJournalEntries ?? shared.context.recentJournalEntries,
    },
    privacy: { excludedPaths },
  });
}

function parseBooleanSetting(value: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("Value must be true or false.");
}

function parseIntegerSetting(value: string): number {
  return z.coerce.number().int().parse(value);
}

/** Updates one human-requested setting and validates the complete result. */
export function updateContextConfig(
  config: ContextConfig,
  key: string,
  value: string,
): ContextConfig {
  let updated: ContextConfig;
  switch (key) {
    case "domain":
      updated = { ...config, domain: value };
      break;
    case "hooks":
    case "hooks.enabled":
      updated = { ...config, hooks: { ...config.hooks, enabled: parseBooleanSetting(value) } };
      break;
    case "hooks.checkBeforeCommit":
    case "automation.checkBeforeCommit":
      updated = {
        ...config,
        hooks: { ...config.hooks, checkBeforeCommit: parseBooleanSetting(value) },
      };
      break;
    case "context.recentJournalEntries":
      updated = {
        ...config,
        context: {
          ...config.context,
          recentJournalEntries: parseIntegerSetting(value),
        },
      };
      break;
    case "instructions.updateClaudeMd":
      updated = {
        ...config,
        instructions: {
          ...config.instructions,
          updateClaudeMd: parseBooleanSetting(value),
        },
      };
      break;
    case "instructions.updateAgentsMd":
      updated = {
        ...config,
        instructions: {
          ...config.instructions,
          updateAgentsMd: parseBooleanSetting(value),
        },
      };
      break;
    default:
      throw new Error(
        "Supported settings: domain, hooks.enabled, hooks.checkBeforeCommit, context.recentJournalEntries, instructions.updateClaudeMd, and instructions.updateAgentsMd.",
      );
  }
  return withFixedSettings(updated);
}

/**
 * Records the evidence-derived domain from initial context discovery only while the generated
 * default remains untouched. This preserves a human-selected domain across later skill runs.
 */
export function setDomainIfUnspecified(config: ContextConfig, domain: string): ContextConfig {
  if (config.domain !== UNSPECIFIED_DOMAIN) return config;
  return updateContextConfig(config, "domain", domain);
}
