import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import {
  assertSafeManagedPath,
  deleteManagedTextIfUnchanged,
  isFileNotFound,
  readManagedTextIfExists,
  writeManagedTextIfUnchanged,
} from "./files";
import { withJournalMutationLock } from "./journal";
import {
  MANAGED_ARTIFACTS,
  MANAGED_BLOCK_ARTIFACTS,
  isPackageManagedSkill,
} from "./managed-artifacts";
import type { ManagedArtifact } from "./managed-artifacts";
import { managedBlock, removeManagedBlock } from "./managed-block";
import { withManagedLifecycleLock } from "./setup";
import {
  type UninstallHooksPreview,
  applyUninstallHooks,
  previewUninstallHooks,
  uninstallHookPaths,
  validateUninstallHooks,
} from "./uninstall-hooks";
import {
  type PurgeSnapshot,
  applyPurgeTree,
  finishPurgeTree,
  snapshotPurgeTree,
  validatePurgeTree,
} from "./uninstall-purge";

/**
 * Bounded removal workflow for managed artifacts. Extend registry lifecycle policies instead of
 * adding path-specific deletion rules, and preserve user-owned content by default.
 */

const LOCAL_STATE_PATHS = [
  ".ccr/config.local.json",
  ".ccr/journal",
  ".ccr/private",
  ".ccr/cache",
  ".ccr/tmp",
] as const;

const INTERNAL_PRIVATE_PATHS = new Set([
  "journal-mutation.lock",
  "managed-lifecycle.lock",
  "managed-write-locks",
]);

export interface UninstallPreview {
  removePaths: string[];
  modifyPaths: string[];
  removals: UninstallRemoval[];
  modifications: UninstallModification[];
  removeContext: boolean;
  root: string;
  purge: boolean;
  hooks?: UninstallHooksPreview;
  purgeSnapshot?: PurgeSnapshot;
}

export interface UninstallOptions {
  purge?: boolean;
  removeHooks?: boolean;
}

export interface UninstallRemoval {
  expectedContent: string;
  path: string;
  maximumCharacters?: number;
}

export interface UninstallModification extends UninstallRemoval {
  updatedContent: string;
}

function shouldRemoveArtifact(
  artifact: ManagedArtifact,
  existing: string | undefined,
  shouldRemoveContext: boolean,
): boolean {
  if (existing === undefined) return false;
  switch (artifact.uninstallPolicy) {
    case "preserve":
      return false;
    case "remove-if-marked":
      return existing === artifact.content || isPackageManagedSkill(existing);
    case "remove-with-context":
      return shouldRemoveContext;
  }
}

async function hasLocalState(root: string): Promise<boolean> {
  for (const relativePath of LOCAL_STATE_PATHS) {
    if (await hasLocalStateAtPath(root, relativePath)) return true;
  }
  return false;
}

async function hasLocalStateAtPath(root: string, relativePath: string): Promise<boolean> {
  const target = await assertSafeManagedPath(root, relativePath);
  try {
    const details = await lstat(target);
    if (!details.isDirectory()) return true;
    const entries = await readdir(target, { withFileTypes: true });
    for (const entry of entries) {
      if (relativePath === ".ccr/private" && INTERNAL_PRIVATE_PATHS.has(entry.name)) continue;
      if (!entry.isDirectory()) return true;
      if (await hasLocalStateAtPath(root, `${relativePath}/${entry.name}`)) return true;
    }
    return false;
  } catch (error: unknown) {
    if (isFileNotFound(error)) return false;
    throw error;
  }
}

/** Previews managed integration cleanup; purge explicitly includes every safe path inside .ccr. */
export async function previewUninstall(
  root: string,
  shouldRemoveContext: boolean,
  options: UninstallOptions = {},
): Promise<UninstallPreview> {
  const purge = options.purge === true;
  const hooks = options.removeHooks || purge ? await previewUninstallHooks(root) : undefined;
  const purgeSnapshot = purge ? await snapshotPurgeTree(root) : undefined;
  const removePaths: string[] = [];
  const removals: UninstallRemoval[] = [];
  for (const artifact of MANAGED_ARTIFACTS) {
    if (purge && artifact.path.startsWith(".ccr/")) continue;
    const existing = await readManagedTextIfExists(root, artifact.path, artifact.maximumCharacters);
    if (
      purge &&
      artifact.kind === "skill" &&
      existing !== undefined &&
      !shouldRemoveArtifact(artifact, existing, true)
    ) {
      throw new Error(`Cannot verify CCR ownership of ${artifact.path}; cleanup stopped.`);
    }
    if (shouldRemoveArtifact(artifact, existing, shouldRemoveContext)) {
      removePaths.push(artifact.path);
      if (existing !== undefined)
        removals.push({
          path: artifact.path,
          expectedContent: existing,
          ...(artifact.maximumCharacters === undefined
            ? {}
            : { maximumCharacters: artifact.maximumCharacters }),
        });
    }
  }
  const modifyPaths: string[] = [];
  const modifications: UninstallModification[] = [];
  const isLocalStatePresent = purge ? false : await hasLocalState(root);
  for (const blockArtifact of MANAGED_BLOCK_ARTIFACTS) {
    if (blockArtifact.uninstallCondition === "without-local-state" && isLocalStatePresent) continue;
    const content = await readManagedTextIfExists(root, blockArtifact.path);
    if (content === undefined) continue;
    const updatedContent = removeManagedBlock(
      content,
      managedBlock(blockArtifact.content),
      blockArtifact.path,
      { terminalSeparator: "owned" },
    );
    if (updatedContent !== content) {
      modifyPaths.push(blockArtifact.path);
      modifications.push({
        path: blockArtifact.path,
        expectedContent: content,
        updatedContent,
      });
    }
  }
  if (hooks !== undefined) {
    const paths = uninstallHookPaths(hooks);
    removePaths.push(...paths.remove);
    modifyPaths.push(...paths.modify);
    if (hooks.kind === "recorded" && !purge) removePaths.push(".ccr/private/hooks-state.json");
  }
  if (purge) removePaths.push(".ccr");
  return {
    root,
    removeContext: shouldRemoveContext,
    removePaths,
    modifyPaths,
    removals,
    modifications,
    purge,
    ...(hooks === undefined ? {} : { hooks }),
    ...(purgeSnapshot === undefined ? {} : { purgeSnapshot }),
  };
}

function reconcileSuppliedPreview(
  supplied: UninstallPreview,
  current: UninstallPreview,
): UninstallPreview {
  const removals = current.removals.filter((candidate) =>
    supplied.removals.some(
      (planned) =>
        planned.path === candidate.path && planned.expectedContent === candidate.expectedContent,
    ),
  );
  const modifications = current.modifications.filter((candidate) =>
    supplied.modifications.some(
      (planned) =>
        planned.path === candidate.path &&
        planned.expectedContent === candidate.expectedContent &&
        planned.updatedContent === candidate.updatedContent,
    ),
  );
  return {
    root: current.root,
    removeContext: current.removeContext,
    removePaths: current.removePaths.filter(
      (file) =>
        !current.removals.some((item) => item.path === file) ||
        removals.some((item) => item.path === file),
    ),
    modifyPaths: current.modifyPaths.filter(
      (file) =>
        !current.modifications.some((item) => item.path === file) ||
        modifications.some((item) => item.path === file),
    ),
    removals,
    modifications,
    purge: current.purge,
    ...(current.hooks === undefined ? {} : { hooks: current.hooks }),
    ...(current.purgeSnapshot === undefined ? {} : { purgeSnapshot: current.purgeSnapshot }),
  };
}

/** Removes verified integration, preserving user data unless shared-context removal or purge is explicit. */
export async function applyUninstall(
  root: string,
  shouldRemoveContext: boolean,
  suppliedPreview?: UninstallPreview,
  options: UninstallOptions = {},
): Promise<UninstallPreview> {
  const result = await withManagedLifecycleLock(root, () =>
    withJournalMutationLock(root, async () => {
      if (
        suppliedPreview !== undefined &&
        (path.resolve(suppliedPreview.root) !== path.resolve(root) ||
          suppliedPreview.removeContext !== shouldRemoveContext ||
          suppliedPreview.purge !== (options.purge === true) ||
          (suppliedPreview.hooks !== undefined) !==
            (options.removeHooks === true || options.purge === true))
      ) {
        throw new Error("CCR uninstall preview does not match this operation.");
      }
      if (suppliedPreview !== undefined) {
        if (suppliedPreview.hooks !== undefined)
          await validateUninstallHooks(root, suppliedPreview.hooks);
        if (suppliedPreview.purgeSnapshot !== undefined)
          await validatePurgeTree(root, suppliedPreview.purgeSnapshot);
        for (const planned of [...suppliedPreview.removals, ...suppliedPreview.modifications]) {
          if (
            (await readManagedTextIfExists(root, planned.path, planned.maximumCharacters)) !==
            planned.expectedContent
          ) {
            throw new Error(`CCR managed file changed after preview: ${planned.path}.`);
          }
        }
      }
      const currentPreview = await previewUninstall(root, shouldRemoveContext, options);
      const preview =
        suppliedPreview === undefined
          ? currentPreview
          : reconcileSuppliedPreview(suppliedPreview, currentPreview);
      // Validate everything before the first write, then remove hooks before deleting their records.
      if (preview.hooks !== undefined)
        await applyUninstallHooks(root, preview.hooks, preview.purge);
      for (const removal of preview.removals) {
        if (!(await deleteManagedTextIfUnchanged(root, removal.path, removal.expectedContent))) {
          throw new Error(`CCR managed file changed after preview: ${removal.path}.`);
        }
      }
      for (const modification of preview.modifications) {
        if (
          !(await writeManagedTextIfUnchanged(
            root,
            modification.path,
            modification.expectedContent,
            modification.updatedContent,
          ))
        ) {
          throw new Error(`CCR managed file changed after preview: ${modification.path}.`);
        }
      }
      if (preview.purgeSnapshot !== undefined) await applyPurgeTree(root, preview.purgeSnapshot);
      return preview;
    }),
  );
  if (result.purge) await finishPurgeTree(root);
  return result;
}
