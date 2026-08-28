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
}

export interface UninstallRemoval {
  expectedContent: string;
  path: string;
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

/** Previews files affected by uninstall without deleting user-edited context by default. */
export async function previewUninstall(
  root: string,
  shouldRemoveContext: boolean,
): Promise<UninstallPreview> {
  const removePaths: string[] = [];
  const removals: UninstallRemoval[] = [];
  for (const artifact of MANAGED_ARTIFACTS) {
    const existing = await readManagedTextIfExists(root, artifact.path);
    if (shouldRemoveArtifact(artifact, existing, shouldRemoveContext)) {
      removePaths.push(artifact.path);
      if (existing !== undefined) removals.push({ path: artifact.path, expectedContent: existing });
    }
  }
  const modifyPaths: string[] = [];
  const modifications: UninstallModification[] = [];
  const isLocalStatePresent = await hasLocalState(root);
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
  return {
    root,
    removeContext: shouldRemoveContext,
    removePaths,
    modifyPaths,
    removals,
    modifications,
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
    removePaths: removals.map((removal) => removal.path),
    modifyPaths: modifications.map((modification) => modification.path),
    removals,
    modifications,
  };
}

/** Applies a bounded uninstall and removes only known files and marked instruction blocks. */
export async function applyUninstall(
  root: string,
  shouldRemoveContext: boolean,
  suppliedPreview?: UninstallPreview,
): Promise<UninstallPreview> {
  return withManagedLifecycleLock(root, () =>
    withJournalMutationLock(root, async () => {
      if (
        suppliedPreview !== undefined &&
        (path.resolve(suppliedPreview.root) !== path.resolve(root) ||
          suppliedPreview.removeContext !== shouldRemoveContext)
      ) {
        throw new Error("CCR uninstall preview does not match this operation.");
      }
      if (suppliedPreview !== undefined) {
        for (const planned of [...suppliedPreview.removals, ...suppliedPreview.modifications]) {
          if ((await readManagedTextIfExists(root, planned.path)) !== planned.expectedContent) {
            throw new Error(`CCR managed file changed after preview: ${planned.path}.`);
          }
        }
      }
      const currentPreview = await previewUninstall(root, shouldRemoveContext);
      const preview =
        suppliedPreview === undefined
          ? currentPreview
          : reconcileSuppliedPreview(suppliedPreview, currentPreview);
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
      return preview;
    }),
  );
}
