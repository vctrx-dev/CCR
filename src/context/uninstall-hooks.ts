import { createHash } from "node:crypto";
import { chmod, lstat } from "node:fs/promises";
import path from "node:path";
import {
  assertSafeManagedPath,
  deleteManagedTextIfUnchanged,
  readManagedTextIfExists,
  writeManagedTextIfUnchanged,
} from "./files";
import { type HookState, readHookState } from "./hook-state";
import {
  type ContextHookRemovalPreview,
  previewContextHookRemoval,
  removeAllContextHooks,
  validateContextHookRemoval,
} from "./hooks";
import { inspectManagedBlock, managedBlock, removeManagedBlock } from "./managed-block";

const STATE_PATH = ".ccr/private/hooks-state.json";
const MAX_HOOK_CHARACTERS = 1_000_000;

interface RecordedHookRemoval {
  path: string;
  original: string | undefined;
  restored: string | undefined;
  mode?: number;
}

export type UninstallHooksPreview =
  | { kind: "legacy"; preview: ContextHookRemovalPreview }
  | { kind: "recorded"; stateContent: string; removals: RecordedHookRemoval[] };

function matchesOriginal(content: string, artifact: HookState["artifacts"][number]): boolean {
  return (
    Buffer.byteLength(content, "utf8") === artifact.originalByteLength &&
    createHash("sha256").update(content).digest("hex") === artifact.originalSha256
  );
}

function restoreHook(content: string, artifact: HookState["artifacts"][number]): string {
  if (matchesOriginal(content, artifact)) return content;
  const lines = content.split(/\r?\n/);
  // Use exact standalone markers in the file's own comment syntax, never language parsers or execution.
  const starts = lines.filter((line) => /^\s*(?:#|\/\/|;|--|<!--) ccr:start(?:\s|$)/.test(line));
  const ends = lines.filter((line) => /^\s*(?:#|\/\/|;|--|<!--) ccr:end(?: -->)?\s*$/.test(line));
  if (starts.length !== 1 || ends.length !== 1) {
    throw new Error(
      `Cannot safely remove CCR hook entries in ${artifact.path}: expected one marked block.`,
    );
  }
  const block = managedBlock(`${starts[0]}\n${ends[0]}`);
  const inspection = inspectManagedBlock(content, block);
  if (inspection.status !== "valid") {
    throw new Error(`CCR managed block conflict in ${artifact.path}.`);
  }
  let restored = removeManagedBlock(content, block, artifact.path);
  if (artifact.separatorByteCount > 0) {
    const separator = content.slice(
      inspection.start - artifact.separatorByteCount,
      inspection.start,
    );
    if (inspection.start < artifact.separatorByteCount || !/^(?:\r?\n)+$/.test(separator)) {
      throw new Error(`Cannot verify the CCR hook separator in ${artifact.path}.`);
    }
    restored =
      restored.slice(0, inspection.start - artifact.separatorByteCount) +
      restored.slice(inspection.start);
  }
  // A newly created minimal hook may have an interpreter line outside its marked block.
  if (!artifact.existed && (restored === "#!/bin/sh\n" || restored === "#!/bin/sh\r\n")) {
    restored = "";
  }
  if (!matchesOriginal(restored, artifact)) {
    throw new Error(
      `Original hook bytes cannot be verified in ${artifact.path}; no files changed.`,
    );
  }
  return restored;
}

/** Plans recorded hook cleanup only when removing CCR restores the recorded original bytes. */
export async function previewUninstallHooks(root: string): Promise<UninstallHooksPreview> {
  const result = await readHookState(root);
  if (result.status === "invalid")
    throw new Error(`CCR has invalid hook provenance: ${result.issue}`);
  if (result.status === "missing") {
    return { kind: "legacy", preview: await previewContextHookRemoval(root) };
  }
  const stateContent = await readManagedTextIfExists(root, STATE_PATH, 65_536);
  if (stateContent === undefined) throw new Error("CCR hook records changed during preview.");
  const verified = await readHookState(root);
  if (
    verified.status !== "valid" ||
    JSON.stringify(verified.state) !== JSON.stringify(result.state) ||
    (await readManagedTextIfExists(root, STATE_PATH, 65_536)) !== stateContent
  ) {
    throw new Error("CCR hook records changed during preview.");
  }
  const removals: RecordedHookRemoval[] = [];
  const paths = new Set<string>();
  for (const artifact of result.state.artifacts) {
    const target = await assertSafeManagedPath(root, artifact.path.replaceAll("\\", "/"));
    const relativePath = path.relative(root, target).replaceAll(path.sep, "/");
    const canonicalPath = process.platform === "win32" ? target.toLowerCase() : target;
    const ownershipPath = relativePath.toLowerCase();
    if (paths.has(canonicalPath) || ownershipPath.startsWith(".ccr/") || ownershipPath === ".ccr") {
      throw new Error(`Invalid recorded hook path: ${artifact.path}`);
    }
    paths.add(canonicalPath);
    if (!artifact.existed && !matchesOriginal("", artifact)) {
      throw new Error(`Invalid original bytes for a newly created hook: ${artifact.path}`);
    }
    const original = await readManagedTextIfExists(root, relativePath, MAX_HOOK_CHARACTERS);
    if (original === undefined && artifact.existed) {
      throw new Error(`Original hook is missing: ${artifact.path}`);
    }
    if (original !== undefined && !(await lstat(target)).isFile()) {
      throw new Error(`Recorded hook is not a regular file: ${artifact.path}`);
    }
    removals.push({
      path: relativePath,
      original,
      restored: artifact.existed ? restoreHook(original ?? "", artifact) : undefined,
      ...(original === undefined ? {} : { mode: (await lstat(target)).mode & 0o777 }),
    });
    // Even a newly created file must contain only the verified CCR integration before deletion.
    if (!artifact.existed && original !== undefined) restoreHook(original, artifact);
  }
  if (result.state.frameworkSourcePath !== null) {
    const framework = await assertSafeManagedPath(
      root,
      result.state.frameworkSourcePath.replaceAll("\\", "/"),
    );
    if (!paths.has(process.platform === "win32" ? framework.toLowerCase() : framework)) {
      throw new Error("CCR framework source is not covered by the hook records; cleanup stopped.");
    }
  }
  return { kind: "recorded", stateContent, removals };
}

/** Lists only hook changes proven safe by the preview, without exposing private hook content. */
export function uninstallHookPaths(preview: UninstallHooksPreview): {
  remove: string[];
  modify: string[];
} {
  if (preview.kind === "legacy") return preview.preview.paths;
  return {
    remove: preview.removals
      .filter((item) => item.original !== undefined && item.restored === undefined)
      .map((item) => item.path),
    modify: preview.removals
      .filter((item) => item.restored !== undefined && item.original !== item.restored)
      .map((item) => item.path),
  };
}

/** Rechecks hook records, exact contents, permissions, and path safety before any cleanup write. */
export async function validateUninstallHooks(
  root: string,
  preview: UninstallHooksPreview,
): Promise<void> {
  if (preview.kind === "legacy") {
    if ((await readHookState(root)).status !== "missing")
      throw new Error("CCR hook records changed after preview.");
    await validateContextHookRemoval(root, preview.preview);
    return;
  }
  if ((await readManagedTextIfExists(root, STATE_PATH, 65_536)) !== preview.stateContent) {
    throw new Error("CCR hook records changed after preview.");
  }
  for (const removal of preview.removals) {
    if (
      (await readManagedTextIfExists(root, removal.path, MAX_HOOK_CHARACTERS)) !== removal.original
    ) {
      throw new Error(`Git hook changed after preview: ${removal.path}`);
    }
    if (
      removal.mode !== undefined &&
      ((await lstat(await assertSafeManagedPath(root, removal.path))).mode & 0o777) !== removal.mode
    ) {
      throw new Error(`Git hook permissions changed after preview: ${removal.path}`);
    }
  }
}

/** Removes verified hook integration without execution; keeps records until hooks are cleaned. */
export async function applyUninstallHooks(
  root: string,
  preview: UninstallHooksPreview,
  preserveState = false,
): Promise<void> {
  await validateUninstallHooks(root, preview);
  if (preview.kind === "legacy") {
    await removeAllContextHooks(root, preview.preview);
    return;
  }
  for (const removal of preview.removals) {
    if (removal.original === undefined || removal.restored === removal.original) continue;
    const applied =
      removal.restored === undefined
        ? await deleteManagedTextIfUnchanged(root, removal.path, removal.original)
        : await writeManagedTextIfUnchanged(root, removal.path, removal.original, removal.restored);
    if (!applied) throw new Error(`Git hook changed after preview: ${removal.path}`);
    if (removal.restored !== undefined && removal.mode !== undefined) {
      await chmod(await assertSafeManagedPath(root, removal.path), removal.mode);
    }
  }
  if (
    !preserveState &&
    !(await deleteManagedTextIfUnchanged(root, STATE_PATH, preview.stateContent))
  ) {
    throw new Error("CCR hook records changed after cleanup; records preserved.");
  }
}
