import { DEFAULT_CONTEXT_CONFIG, parseContextConfig, serializeContextConfig } from "./config";
import type { ContextConfig } from "./config";
import { CONFIG_MANUAL } from "./config-manual";
import { readManagedTextIfExists, writeManagedText } from "./files";
import { MANAGED_ARTIFACTS, isPackageManagedSkill } from "./managed-artifacts";
import type { ManagedArtifact } from "./managed-artifacts";
import { managedBlock, upsertManagedBlock } from "./managed-block";
import { CLAUDE_BLOCK, IGNORE_BLOCK } from "./templates";

/**
 * Setup orchestration for the managed-artifact registry. New generated artifacts belong in that
 * registry, not in this workflow, so their lifecycle is handled consistently.
 */

export type SetupAction = "create" | "modify" | "preserve" | "unchanged";

export interface SetupChange {
  path: string;
  action: SetupAction;
  content: string;
}

export interface SetupPreview {
  root: string;
  config: ContextConfig;
  changes: SetupChange[];
}

async function readSetupConfig(root: string): Promise<ContextConfig> {
  const configText = await readManagedTextIfExists(root, ".ccr/config.json");
  return configText ? parseContextConfig(configText) : DEFAULT_CONTEXT_CONFIG;
}

function planArtifactChange(artifact: ManagedArtifact, existing: string | undefined): SetupChange {
  const { content, path: relativePath, setupPolicy } = artifact;
  const isManagedSkill = existing !== undefined && isPackageManagedSkill(existing);
  if (
    setupPolicy === "upgrade-if-marked" &&
    existing?.includes("<!-- managed by CCR skill;") &&
    !isManagedSkill
  ) {
    throw new Error(`CCR managed file conflict in ${relativePath}.`);
  }

  let action: SetupAction;
  if (existing === undefined) action = "create";
  else if (setupPolicy === "preserve-existing") action = "preserve";
  else if (existing === content) action = "unchanged";
  else if (setupPolicy === "upgrade-if-marked" && isManagedSkill) action = "modify";
  else action = "preserve";

  return {
    path: relativePath,
    action,
    content: setupPolicy === "preserve-existing" && existing ? existing : content,
  };
}

/** Returns every proposed setup change without writing to the target repository. */
export async function previewSetup(root: string): Promise<SetupPreview> {
  const config = await readSetupConfig(root);
  const requested: Record<string, string> = {
    ".gitignore": upsertManagedBlock(
      await readManagedTextIfExists(root, ".gitignore"),
      managedBlock(IGNORE_BLOCK),
      ".gitignore",
    ),
  };
  if (config.instructions.updateClaudeMd) {
    requested["CLAUDE.md"] = upsertManagedBlock(
      await readManagedTextIfExists(root, "CLAUDE.md"),
      managedBlock(CLAUDE_BLOCK),
      "CLAUDE.md",
    );
  }
  if (config.instructions.updateAgentsMd) {
    requested["AGENTS.md"] = upsertManagedBlock(
      await readManagedTextIfExists(root, "AGENTS.md"),
      managedBlock(CLAUDE_BLOCK),
      "AGENTS.md",
    );
  }
  const managedEntries = await Promise.all(
    MANAGED_ARTIFACTS.map(async (artifact): Promise<SetupChange> => {
      const existing = await readManagedTextIfExists(root, artifact.path);
      return planArtifactChange(artifact, existing);
    }),
  );
  const changes = await Promise.all(
    Object.entries(requested).map(async ([relativePath, content]): Promise<SetupChange> => {
      const existing = await readManagedTextIfExists(root, relativePath);
      return {
        path: relativePath,
        action: existing === undefined ? "create" : existing === content ? "unchanged" : "modify",
        content,
      };
    }),
  );
  return { root, config, changes: [...managedEntries, ...changes] };
}

/** Applies the preview while preserving existing context and user-authored files. */
export async function applySetup(root: string): Promise<{ changedPaths: string[] }> {
  const preview = await previewSetup(root);
  const changedPaths: string[] = [];
  for (const change of preview.changes) {
    if (change.action === "unchanged" || change.action === "preserve") continue;
    await writeManagedText(root, change.path, change.content);
    changedPaths.push(change.path);
  }
  return { changedPaths };
}

export interface ConfigSetupResult {
  config: SetupChange;
  manual: SetupChange;
}

function planConfigFile(path: string, content: string, existing: string | undefined): SetupChange {
  const action: SetupAction =
    existing === undefined ? "create" : existing === content ? "unchanged" : "modify";
  return { path, action, content };
}

/** Explicitly creates or upgrades the human-owned configuration and its companion manual. */
export async function applyConfigSetup(root: string): Promise<ConfigSetupResult> {
  const config = await readSetupConfig(root);
  const configPath = ".ccr/config.json";
  const manualPath = ".ccr/config-manual.md";
  const [existingConfig, existingManual] = await Promise.all([
    readManagedTextIfExists(root, configPath),
    readManagedTextIfExists(root, manualPath),
  ]);
  const configChange = planConfigFile(configPath, serializeContextConfig(config), existingConfig);
  const manualChange = planConfigFile(manualPath, CONFIG_MANUAL, existingManual);
  for (const change of [configChange, manualChange]) {
    if (change.action !== "unchanged") await writeManagedText(root, change.path, change.content);
  }
  return { config: configChange, manual: manualChange };
}
