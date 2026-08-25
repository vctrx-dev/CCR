import { z } from "zod";

/**
 * Human-owned CCR settings. Keep this public shape small; runtime safety defaults belong in the
 * resolved configuration below and must not become user-editable by accident. New configuration
 * behavior belongs here with its schema, defaults, migration, and update path; callers must not
 * parse or mutate CCR configuration independently.
 */

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
  })
  .strict();

const instructionsSchema = z
  .object({
    updateClaudeMd: z.boolean(),
    updateAgentsMd: z.boolean(),
    updateDecisionsMd: z.boolean().default(false),
  })
  .strict();

const publicConfigSchema = z
  .object({
    domain: z.string().trim().min(1).max(80).default("unspecified"),
    hooks: hooksSettingsSchema.default({ enabled: true, checkBeforeCommit: true }),
    context: contextSettingsSchema.default({
      recentJournalEntries: 3,
      maxCompactionPercent: 25,
    }),
    instructions: instructionsSchema.default({
      updateClaudeMd: false,
      updateAgentsMd: false,
      updateDecisionsMd: false,
    }),
  })
  .strict();

const resolvedConfigSchema = z
  .object({
    domain: z.string().trim().min(1).max(80),
    hooks: hooksSettingsSchema,
    context: contextSettingsSchema,
    privacy: z.object({ excludedPaths: z.array(z.string().min(1)).max(100) }).strict(),
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
    instructions: instructionsSchema.passthrough(),
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
  hooks: { enabled: true, checkBeforeCommit: true },
  context: {
    recentJournalEntries: 3,
    maxCompactionPercent: 25,
  },
  privacy: { excludedPaths: [] },
  instructions: {
    updateClaudeMd: false,
    updateAgentsMd: false,
    updateDecisionsMd: false,
  },
};

function fromPublicConfig(config: PublicContextConfig): ContextConfig {
  return resolvedConfigSchema.parse({
    ...DEFAULT_CONTEXT_CONFIG,
    domain: config.domain,
    hooks: config.hooks,
    context: config.context,
    instructions: config.instructions,
  });
}

/** Returns only the human-editable settings written to `.ccr/config.json`. */
export function toPublicContextConfig(config: ContextConfig): PublicContextConfig {
  return publicConfigSchema.parse({
    domain: config.domain,
    hooks: config.hooks,
    context: config.context,
    instructions: config.instructions,
  });
}

/** Serializes the minimal, strict-JSON configuration file. */
export function serializeContextConfig(config: ContextConfig): string {
  return `${JSON.stringify(toPublicContextConfig(config), null, 2)}\n`;
}

function migrateLegacyConfig(config: z.infer<typeof legacyConfigSchema>): ContextConfig {
  return resolvedConfigSchema.parse({
    ...DEFAULT_CONTEXT_CONFIG,
    domain: config.domain,
    hooks: {
      enabled: config.hooks ?? true,
      checkBeforeCommit: config.automation?.checkBeforeCommit ?? true,
    },
    context: {
      ...DEFAULT_CONTEXT_CONFIG.context,
      recentJournalEntries: config.context.recentJournalEntries,
      maxCompactionPercent:
        config.context.maxCompactionPercent ?? DEFAULT_CONTEXT_CONFIG.context.maxCompactionPercent,
    },
    privacy: {
      excludedPaths: [
        ...new Set([
          ...DEFAULT_CONTEXT_CONFIG.privacy.excludedPaths,
          ...config.privacy.excludedPaths,
        ]),
      ],
    },
    instructions: config.instructions,
  });
}

/** Parses the minimal format and migrates supported legacy files in memory. */
export function parseContextConfig(input: string): ContextConfig {
  const value: unknown = JSON.parse(input);
  const current = publicConfigSchema.safeParse(value);
  if (current.success) return fromPublicConfig(current.data);

  const legacy = legacyConfigSchema.safeParse(value);
  if (!legacy.success) throw current.error;
  return migrateLegacyConfig(legacy.data);
}

/** Parses the intentionally limited set of per-developer overrides. */
export function parseLocalContextConfig(input: string): LocalContextConfig {
  return localConfigSchema.parse(JSON.parse(input));
}

/** Merges local restrictions without allowing team exclusions to be removed. */
export function resolveContextConfig(
  shared: ContextConfig,
  local: LocalContextConfig = {},
): ContextConfig {
  const excludedPaths = [
    ...new Set([...shared.privacy.excludedPaths, ...(local.privacy?.excludedPaths ?? [])]),
  ];
  return {
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
  };
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
    case "context.maxCompactionPercent":
      updated = {
        ...config,
        context: {
          ...config.context,
          maxCompactionPercent: parseIntegerSetting(value),
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
    case "instructions.updateDecisionsMd":
      updated = {
        ...config,
        instructions: {
          ...config.instructions,
          updateDecisionsMd: parseBooleanSetting(value),
        },
      };
      break;
    default:
      throw new Error(
        "Supported settings: domain, hooks.enabled, hooks.checkBeforeCommit, context.recentJournalEntries, context.maxCompactionPercent, instructions.updateClaudeMd, instructions.updateAgentsMd, and instructions.updateDecisionsMd.",
      );
  }
  return resolvedConfigSchema.parse(updated);
}
