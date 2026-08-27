import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { DEFAULT_CONTEXT_CONFIG, parseContextConfig, serializeContextConfig } from "./config";
import type { ContextConfig } from "./config";
import { CONFIG_MANUAL } from "./config-manual";
import {
  MANAGED_LIFECYCLE_LOCK_PATH,
  deleteManagedTextIfUnchanged,
  readManagedTextIfExists,
  withManagedLock,
  writeManagedTextIfUnchanged,
} from "./files";
import {
  MANAGED_ARTIFACTS,
  MANAGED_BLOCK_ARTIFACTS,
  RETIRED_MANAGED_ARTIFACTS,
  managedSkillOwnership,
} from "./managed-artifacts";
import type { ManagedArtifact } from "./managed-artifacts";
import { managedBlock, upsertManagedBlock } from "./managed-block";

/**
 * Setup orchestration for the managed-artifact registry. New generated artifacts belong in that
 * registry, not in this workflow, so their lifecycle is handled consistently.
 */

export type SetupAction = "create" | "modify" | "preserve" | "remove" | "unchanged";

export interface SetupChange {
  path: string;
  action: SetupAction;
  content: string;
  expectedContent: string | undefined;
}

export interface SetupPreview {
  root: string;
  config: ContextConfig;
  changes: SetupChange[];
}

const MAX_LIFECYCLE_LOCK_ATTEMPTS = 600;
const LIFECYCLE_LOCK_RETRY_MS = 50;

/**
 * Serializes CCR lifecycle writers through one repository-local, token-owned lock. Keep new setup,
 * update, and removal entry points inside this boundary so their previews cannot apply concurrently.
 */
export async function withManagedLifecycleLock<T>(
  root: string,
  operation: () => Promise<T>,
): Promise<T> {
  return withManagedLock(
    root,
    MANAGED_LIFECYCLE_LOCK_PATH,
    {
      busyMessage: "CCR managed lifecycle remained busy; retry the operation.",
      maximumAttempts: MAX_LIFECYCLE_LOCK_ATTEMPTS,
      retryMilliseconds: LIFECYCLE_LOCK_RETRY_MS,
    },
    operation,
  );
}

async function readSetupConfig(root: string): Promise<ContextConfig> {
  const configText = await readManagedTextIfExists(root, ".ccr/config.json");
  return configText ? parseContextConfig(configText) : DEFAULT_CONTEXT_CONFIG;
}

function planArtifactChange(artifact: ManagedArtifact, existing: string | undefined): SetupChange {
  const { content, path: relativePath, setupPolicy } = artifact;
  const skillOwnership = existing === undefined ? "user" : managedSkillOwnership(existing);
  if (setupPolicy === "upgrade-if-marked" && skillOwnership === "foreign") {
    throw new Error(`CCR managed file conflict in ${relativePath}.`);
  }

  let action: SetupAction;
  if (existing === undefined) action = "create";
  else if (setupPolicy === "preserve-existing") action = "preserve";
  else if (existing === content) action = "unchanged";
  else if (setupPolicy === "upgrade-if-marked" && skillOwnership === "package") action = "modify";
  else action = "preserve";

  return {
    path: relativePath,
    action,
    content: setupPolicy === "preserve-existing" && existing !== undefined ? existing : content,
    expectedContent: existing,
  };
}

/** Returns every proposed setup change without writing to the target repository. */
export async function previewSetup(root: string): Promise<SetupPreview> {
  const config = await readSetupConfig(root);
  const blockArtifacts = MANAGED_BLOCK_ARTIFACTS.filter(
    ({ setupCondition }) =>
      setupCondition === "always" || config.instructions[setupCondition] === true,
  );
  const managedEntries = await Promise.all(
    MANAGED_ARTIFACTS.map(async (artifact): Promise<SetupChange> => {
      const existing = await readManagedTextIfExists(root, artifact.path);
      return planArtifactChange(artifact, existing);
    }),
  );
  const retiredEntries = (
    await Promise.all(
      RETIRED_MANAGED_ARTIFACTS.map(async (artifact): Promise<SetupChange | undefined> => {
        const existing = await readManagedTextIfExists(root, artifact.path);
        if (existing === undefined) return undefined;
        const isRetiredPackageSkill =
          artifact.path.startsWith(".claude/skills/") &&
          managedSkillOwnership(existing) === "package";
        return {
          path: artifact.path,
          action: existing === artifact.content || isRetiredPackageSkill ? "remove" : "preserve",
          content: artifact.content,
          expectedContent: existing,
        };
      }),
    )
  ).filter((change): change is SetupChange => change !== undefined);
  const changes = await Promise.all(
    blockArtifacts.map(async (artifact): Promise<SetupChange> => {
      const relativePath = artifact.path;
      const existing = await readManagedTextIfExists(root, relativePath);
      const content = upsertManagedBlock(existing, managedBlock(artifact.content), relativePath);
      return {
        path: relativePath,
        action: existing === undefined ? "create" : existing === content ? "unchanged" : "modify",
        content,
        expectedContent: existing,
      };
    }),
  );
  return { root, config, changes: [...managedEntries, ...retiredEntries, ...changes] };
}

/** Applies the preview while preserving existing context and user-authored files. */
export async function applySetup(
  root: string,
  suppliedPreview?: SetupPreview,
): Promise<{ changedPaths: string[] }> {
  return withManagedLifecycleLock(root, async () => {
    const preview = suppliedPreview ?? (await previewSetup(root));
    if (path.resolve(preview.root) !== path.resolve(root)) {
      throw new Error("CCR setup preview belongs to a different repository.");
    }
    for (const change of preview.changes) {
      if (change.action === "unchanged" || change.action === "preserve") continue;
      const current = await readManagedTextIfExists(root, change.path);
      if (current !== change.expectedContent) {
        throw new Error(`CCR managed file changed after preview: ${change.path}.`);
      }
    }
    const changedPaths: string[] = [];
    for (const change of preview.changes) {
      if (change.action === "unchanged" || change.action === "preserve") continue;
      const didApply =
        change.action === "remove"
          ? change.expectedContent !== undefined &&
            (await deleteManagedTextIfUnchanged(root, change.path, change.expectedContent))
          : await writeManagedTextIfUnchanged(
              root,
              change.path,
              change.expectedContent,
              change.content,
            );
      if (!didApply) {
        throw new Error(`CCR managed file changed after preview: ${change.path}.`);
      }
      changedPaths.push(change.path);
    }
    return { changedPaths };
  });
}

export interface ConfigSetupResult {
  config: SetupChange;
  manual: SetupChange;
}

function planConfigFile(path: string, content: string, existing: string | undefined): SetupChange {
  const action: SetupAction =
    existing === undefined ? "create" : existing === content ? "unchanged" : "modify";
  return { path, action, content, expectedContent: existing };
}

/** Explicitly creates or upgrades the human-owned configuration and its companion manual. */
export async function applyConfigSetup(root: string): Promise<ConfigSetupResult> {
  return withManagedLifecycleLock(root, async () => {
    const updateConfigFile = async (): Promise<SetupChange> => {
      const configPath = ".ccr/config.json";
      for (let attempt = 0; attempt < MAX_LIFECYCLE_LOCK_ATTEMPTS; attempt += 1) {
        const existing = await readManagedTextIfExists(root, configPath);
        const config =
          existing === undefined ? DEFAULT_CONTEXT_CONFIG : parseContextConfig(existing);
        const change = planConfigFile(configPath, serializeContextConfig(config), existing);
        if (change.action === "unchanged") return change;
        if (await writeManagedTextIfUnchanged(root, configPath, existing, change.content)) {
          return change;
        }
        await delay(LIFECYCLE_LOCK_RETRY_MS);
      }
      throw new Error("CCR configuration remained busy; retry initialization.");
    };
    const updateManualFile = async (): Promise<SetupChange> => {
      const manualPath = ".ccr/config-manual.md";
      for (let attempt = 0; attempt < MAX_LIFECYCLE_LOCK_ATTEMPTS; attempt += 1) {
        const existing = await readManagedTextIfExists(root, manualPath);
        const change = planConfigFile(manualPath, CONFIG_MANUAL, existing);
        if (change.action === "unchanged") return change;
        if (await writeManagedTextIfUnchanged(root, manualPath, existing, change.content)) {
          return change;
        }
        await delay(LIFECYCLE_LOCK_RETRY_MS);
      }
      throw new Error("CCR configuration manual remained busy; retry initialization.");
    };
    return { config: await updateConfigFile(), manual: await updateManualFile() };
  });
}
