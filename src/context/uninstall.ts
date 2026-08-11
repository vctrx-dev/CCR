import { access, unlink } from "node:fs/promises";
import path from "node:path";
import {
  assertSafeManagedPath,
  isFileNotFound,
  readManagedTextIfExists,
  writeManagedText,
} from "./files";
import {
  MANAGED_ARTIFACTS,
  MANAGED_BLOCK_ARTIFACTS,
  isPackageManagedSkill,
} from "./managed-artifacts";
import type { ManagedArtifact } from "./managed-artifacts";
import { managedBlock, removeManagedBlock } from "./managed-block";

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
    const target = await assertSafeManagedPath(root, relativePath);
    try {
      await access(target);
      return true;
    } catch (error: unknown) {
      if (!isFileNotFound(error)) throw error;
    }
  }
  return false;
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

/** Applies a bounded uninstall and removes only known files and marked instruction blocks. */
export async function applyUninstall(
  root: string,
  shouldRemoveContext: boolean,
  suppliedPreview?: UninstallPreview,
): Promise<UninstallPreview> {
  const preview = suppliedPreview ?? (await previewUninstall(root, shouldRemoveContext));
  if (
    path.resolve(preview.root) !== path.resolve(root) ||
    preview.removeContext !== shouldRemoveContext
  ) {
    throw new Error("CCR uninstall preview does not match this operation.");
  }
  for (const planned of [...preview.removals, ...preview.modifications]) {
    if ((await readManagedTextIfExists(root, planned.path)) !== planned.expectedContent) {
      throw new Error(`CCR managed file changed after preview: ${planned.path}.`);
    }
  }
  for (const removal of preview.removals) {
    await unlink(await assertSafeManagedPath(root, removal.path));
  }
  for (const modification of preview.modifications) {
    await writeManagedText(root, modification.path, modification.updatedContent);
  }
  return preview;
}
