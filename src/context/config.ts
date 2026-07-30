import { z } from "zod";

/**
 * Versioned configuration boundary for all CCR context features. Add a setting through its schema,
 * defaults, migration, help text, and typed updater so shared and local policy cannot drift.
 */

const CONFIG_COMMENT =
  "Human-owned committed settings. CCR and Claude must not change this file unless a human explicitly requests or approves the exact change.";

const CONFIG_HELP = {
  schemaVersion: "integer; fixed: 2; identifies the config format",
  domain: "string; 1-80 characters; short repository domain or `unspecified`",
  "automation.checkBeforeCommit":
    "boolean; true or false; show an advisory warning when staged code has no staged context",
  "discovery.subagentCount":
    "integer; 1-4; parallel read-only discovery agents used by `/ccr-context initialize`",
  "context.recentJournalEntries":
    "integer; 1-10; local continuity entries available to `/ccr-context update`",
  "context.maxCompactionPercent":
    "integer; 20-30; maximum percentage `/ccr-context compact` may remove in one run",
  "privacy.excludedPaths": "string[]; 0-100 Git globs; paths the context broker must never expose",
  "instructions.updateClaudeMd":
    "boolean; true or false; allow setup to maintain a small CCR block in CLAUDE.md",
  "instructions.updateAgentsMd":
    "boolean; true or false; allow setup to maintain a small CCR block in AGENTS.md",
} as const;

const helpSchema = z
  .object({
    schemaVersion: z.literal(CONFIG_HELP.schemaVersion),
    domain: z.literal(CONFIG_HELP.domain),
    "automation.checkBeforeCommit": z.literal(CONFIG_HELP["automation.checkBeforeCommit"]),
    "discovery.subagentCount": z.literal(CONFIG_HELP["discovery.subagentCount"]),
    "context.recentJournalEntries": z.literal(CONFIG_HELP["context.recentJournalEntries"]),
    "context.maxCompactionPercent": z.literal(CONFIG_HELP["context.maxCompactionPercent"]),
    "privacy.excludedPaths": z.literal(CONFIG_HELP["privacy.excludedPaths"]),
    "instructions.updateClaudeMd": z.literal(CONFIG_HELP["instructions.updateClaudeMd"]),
    "instructions.updateAgentsMd": z.literal(CONFIG_HELP["instructions.updateAgentsMd"]),
  })
  .strict();

const contextConfigSchema = z
  .object({
    _comment: z.string().trim().min(1).max(500),
    _help: helpSchema,
    schemaVersion: z.literal(2),
    domain: z.string().trim().min(1).max(80),
    automation: z.object({ checkBeforeCommit: z.boolean() }).strict(),
    discovery: z.object({ subagentCount: z.number().int().min(1).max(4) }).strict(),
    context: z
      .object({
        recentJournalEntries: z.number().int().min(1).max(10),
        maxCompactionPercent: z.number().int().min(20).max(30),
      })
      .strict(),
    privacy: z.object({ excludedPaths: z.array(z.string().min(1)).max(100) }).strict(),
    instructions: z
      .object({
        updateClaudeMd: z.boolean(),
        updateAgentsMd: z.boolean(),
      })
      .strict(),
  })
  .strict();

const previousConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    domain: z.string().trim().min(1).max(80),
    automation: z.object({ checkBeforeCommit: z.boolean() }).passthrough(),
    discovery: z
      .object({ subagentCount: z.number().int().min(1).max(4) })
      .passthrough()
      .optional(),
    context: z.object({ recentJournalEntries: z.number().int().min(1).max(10) }).passthrough(),
    privacy: z.object({ excludedPaths: z.array(z.string().min(1)).max(100) }).passthrough(),
    instructions: z
      .object({
        updateClaudeMd: z.boolean(),
        updateAgentsMd: z.boolean(),
      })
      .passthrough(),
  })
  .passthrough();

const localConfigSchema = z
  .object({
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

export type ContextConfig = z.infer<typeof contextConfigSchema>;
export type LocalContextConfig = z.infer<typeof localConfigSchema>;

export const DEFAULT_CONTEXT_CONFIG: ContextConfig = {
  _comment: CONFIG_COMMENT,
  _help: CONFIG_HELP,
  schemaVersion: 2,
  domain: "unspecified",
  automation: { checkBeforeCommit: true },
  discovery: { subagentCount: 3 },
  context: {
    recentJournalEntries: 3,
    maxCompactionPercent: 25,
  },
  privacy: {
    excludedPaths: [
      ".env*",
      "**/.env*",
      "**/secrets/**",
      "**/credentials/**",
      "**/*.pem",
      "**/*.key",
      "**/*.p12",
      "**/*.pfx",
      "**/student-data/**",
    ],
  },
  instructions: {
    updateClaudeMd: false,
    updateAgentsMd: false,
  },
};

/** Parses current settings or removes retired fields from the previous schema. */
export function parseContextConfig(input: string): ContextConfig {
  const value: unknown = JSON.parse(input);
  const current = contextConfigSchema.safeParse(value);
  if (current.success) return current.data;
  const previous = previousConfigSchema.safeParse(value);
  if (!previous.success) throw current.error;
  return {
    ...DEFAULT_CONTEXT_CONFIG,
    domain: previous.data.domain,
    automation: { checkBeforeCommit: previous.data.automation.checkBeforeCommit },
    discovery: {
      subagentCount:
        previous.data.discovery?.subagentCount ?? DEFAULT_CONTEXT_CONFIG.discovery.subagentCount,
    },
    context: {
      ...DEFAULT_CONTEXT_CONFIG.context,
      recentJournalEntries: previous.data.context.recentJournalEntries,
    },
    privacy: {
      excludedPaths: [
        ...new Set([
          ...DEFAULT_CONTEXT_CONFIG.privacy.excludedPaths,
          ...previous.data.privacy.excludedPaths,
        ]),
      ],
    },
    instructions: {
      updateClaudeMd: previous.data.instructions.updateClaudeMd,
      updateAgentsMd: previous.data.instructions.updateAgentsMd,
    },
  };
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
    automation: {
      checkBeforeCommit: local.automation?.checkBeforeCommit ?? shared.automation.checkBeforeCommit,
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
    case "automation.checkBeforeCommit":
      updated = {
        ...config,
        automation: { checkBeforeCommit: parseBooleanSetting(value) },
      };
      break;
    case "discovery.subagentCount":
      updated = {
        ...config,
        discovery: { subagentCount: parseIntegerSetting(value) },
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
    case "privacy.excludedPaths":
      updated = {
        ...config,
        privacy: {
          excludedPaths: z.array(z.string().min(1)).max(100).parse(JSON.parse(value)),
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
        "Supported settings: domain, automation.checkBeforeCommit, discovery.subagentCount, context.recentJournalEntries, context.maxCompactionPercent, privacy.excludedPaths, and instruction-file opt-ins.",
      );
  }
  return contextConfigSchema.parse(updated);
}
