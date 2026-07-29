import { z } from "zod";

const CONFIG_HELP = {
  root: "Committed team settings. Edit values directly or use `ccr config set`; `_comment` fields are help text.",
  automation:
    "The hook only warns when code is staged without shared context; it never invokes Claude or blocks Git.",
  discovery:
    "Read-only Claude discovery workers used in parallel during initialization (1-4). A separate verification pass always follows.",
  context:
    "Character limits keep shared context concise. recentJournalEntries controls local continuity read by Claude.",
  privacy:
    "The broker never exposes matching paths. Local config may add exclusions but cannot remove these team exclusions.",
  instructions:
    "Opt in only if CCR may add its small managed block to an existing CLAUDE.md or AGENTS.md.",
} as const;

function commentSchema(fallback: string) {
  return z.string().trim().min(1).max(500).default(fallback);
}

const contextConfigSchema = z
  .object({
    _comment: commentSchema(CONFIG_HELP.root),
    schemaVersion: z.literal(1),
    domain: z.string().trim().min(1).max(80),
    automation: z
      .object({
        _comment: commentSchema(CONFIG_HELP.automation),
        mode: z.literal("warn"),
        checkBeforeCommit: z.boolean(),
      })
      .strict(),
    discovery: z
      .object({
        _comment: commentSchema(CONFIG_HELP.discovery),
        subagentCount: z.number().int().min(1).max(4),
      })
      .strict()
      .default({ _comment: CONFIG_HELP.discovery, subagentCount: 3 }),
    context: z
      .object({
        _comment: commentSchema(CONFIG_HELP.context),
        maxIndexCharacters: z.number().int().min(1000).max(20_000),
        maxFileCharacters: z.number().int().min(2000).max(50_000),
        recentJournalEntries: z.number().int().min(1).max(10),
      })
      .strict(),
    privacy: z
      .object({
        _comment: commentSchema(CONFIG_HELP.privacy),
        providerPolicy: z.literal("claude-code-only"),
        excludedPaths: z.array(z.string().min(1)).max(100),
      })
      .strict(),
    instructions: z
      .object({
        _comment: commentSchema(CONFIG_HELP.instructions),
        updateClaudeMd: z.boolean(),
        updateAgentsMd: z.boolean(),
      })
      .strict(),
  })
  .strict();

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
  _comment: CONFIG_HELP.root,
  schemaVersion: 1,
  domain: "unspecified",
  automation: {
    _comment: CONFIG_HELP.automation,
    mode: "warn",
    checkBeforeCommit: true,
  },
  discovery: {
    _comment: CONFIG_HELP.discovery,
    subagentCount: 3,
  },
  context: {
    _comment: CONFIG_HELP.context,
    maxIndexCharacters: 6000,
    maxFileCharacters: 10_000,
    recentJournalEntries: 3,
  },
  privacy: {
    _comment: CONFIG_HELP.privacy,
    providerPolicy: "claude-code-only",
    excludedPaths: [".env*", "**/.env*", "**/secrets/**", "**/student-data/**"],
  },
  instructions: {
    _comment: CONFIG_HELP.instructions,
    updateClaudeMd: false,
    updateAgentsMd: false,
  },
};

/** Parses committed JSON settings and rejects unknown or unsafe values. */
export function parseContextConfig(input: string): ContextConfig {
  return contextConfigSchema.parse(JSON.parse(input));
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
      ...shared.automation,
      checkBeforeCommit: local.automation?.checkBeforeCommit ?? shared.automation.checkBeforeCommit,
    },
    context: {
      ...shared.context,
      recentJournalEntries:
        local.context?.recentJournalEntries ?? shared.context.recentJournalEntries,
    },
    privacy: { ...shared.privacy, excludedPaths },
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

/** Updates one supported setting from a CLI value and validates the complete result. */
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
        automation: { ...config.automation, checkBeforeCommit: parseBooleanSetting(value) },
      };
      break;
    case "discovery.subagentCount":
      updated = {
        ...config,
        discovery: {
          ...config.discovery,
          subagentCount: parseIntegerSetting(value),
        },
      };
      break;
    case "context.maxIndexCharacters":
      updated = {
        ...config,
        context: { ...config.context, maxIndexCharacters: parseIntegerSetting(value) },
      };
      break;
    case "context.maxFileCharacters":
      updated = {
        ...config,
        context: { ...config.context, maxFileCharacters: parseIntegerSetting(value) },
      };
      break;
    case "context.recentJournalEntries":
      updated = {
        ...config,
        context: { ...config.context, recentJournalEntries: parseIntegerSetting(value) },
      };
      break;
    case "privacy.excludedPaths":
      updated = {
        ...config,
        privacy: {
          ...config.privacy,
          excludedPaths: z.array(z.string().min(1)).max(100).parse(JSON.parse(value)),
        },
      };
      break;
    case "instructions.updateClaudeMd":
      updated = {
        ...config,
        instructions: { ...config.instructions, updateClaudeMd: parseBooleanSetting(value) },
      };
      break;
    case "instructions.updateAgentsMd":
      updated = {
        ...config,
        instructions: { ...config.instructions, updateAgentsMd: parseBooleanSetting(value) },
      };
      break;
    default:
      throw new Error(
        "Supported settings: domain, automation.checkBeforeCommit, discovery.subagentCount, context limits, privacy.excludedPaths, and instruction-file opt-ins.",
      );
  }
  return contextConfigSchema.parse(updated);
}
