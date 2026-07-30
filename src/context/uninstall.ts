import { access, readFile, unlink } from "node:fs/promises";
import {
  assertSafeManagedPath,
  isFileNotFound,
  readManagedTextIfExists,
  writeManagedText,
} from "./files";
import { MANAGED_ARTIFACTS, isPackageManagedSkill } from "./managed-artifacts";
import { removeManagedBlock } from "./managed-block";
import { CLAUDE_BLOCK, IGNORE_BLOCK } from "./templates";

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
}

function managedBlock(content: string) {
  return {
    content,
    end: content.slice(content.lastIndexOf("\n") + 1),
    start: content.slice(0, content.indexOf("\n")),
  };
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
  for (const artifact of MANAGED_ARTIFACTS) {
    const existing = await readManagedTextIfExists(root, artifact.path);
    if (
      artifact.uninstallPolicy === "remove-if-marked" &&
      existing &&
      (existing === artifact.content || isPackageManagedSkill(existing))
    ) {
      removePaths.push(artifact.path);
    }
  }
  if (shouldRemoveContext) {
    for (const artifact of MANAGED_ARTIFACTS) {
      if (
        artifact.uninstallPolicy === "remove-with-context" &&
        (await readManagedTextIfExists(root, artifact.path)) !== undefined
      ) {
        removePaths.push(artifact.path);
      }
    }
  }
  const modifyPaths: string[] = [];
  for (const instructionPath of ["CLAUDE.md", "AGENTS.md"]) {
    const content = await readManagedTextIfExists(root, instructionPath);
    if (content?.includes("<!-- ccr:start -->")) modifyPaths.push(instructionPath);
  }
  const ignore = await readManagedTextIfExists(root, ".gitignore");
  if (ignore?.includes("# ccr:start - local context continuity") && !(await hasLocalState(root))) {
    modifyPaths.push(".gitignore");
  }
  return { removePaths, modifyPaths };
}

/** Applies a bounded uninstall and removes only known files and marked instruction blocks. */
export async function applyUninstall(
  root: string,
  shouldRemoveContext: boolean,
): Promise<UninstallPreview> {
  const preview = await previewUninstall(root, shouldRemoveContext);
  for (const relativePath of preview.removePaths) {
    await unlink(await assertSafeManagedPath(root, relativePath));
  }
  for (const relativePath of preview.modifyPaths) {
    const target = await assertSafeManagedPath(root, relativePath);
    const content = await readFile(target, "utf8");
    const updated =
      relativePath === "CLAUDE.md" || relativePath === "AGENTS.md"
        ? removeManagedBlock(content, managedBlock(CLAUDE_BLOCK))
        : removeManagedBlock(content, managedBlock(IGNORE_BLOCK));
    await writeManagedText(root, relativePath, updated);
  }
  return preview;
}
