import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { chmod } from "node:fs/promises";
import path from "node:path";
import { readTextIfExists, writeTextAtomic } from "./files";

/**
 * Conservative inspection and cleanup for CCR's legacy native hook blocks. Repository-adaptive
 * integrations are owned by the ccr-hooks skill and its provenance state, not this compatibility
 * boundary.
 */

export type CcrHookName = "pre-commit" | "post-commit";

export interface HookResult {
  path: string;
  status: "current" | "stale" | "removed" | "not-installed" | "unsupported";
}

interface HookDefinition {
  block: string;
  end: string;
  start: string;
}

const HOOK_DEFINITIONS: Record<CcrHookName, HookDefinition> = {
  "pre-commit": {
    start: "# ccr:start - advisory context check",
    end: "# ccr:end",
    block: `# ccr:start - advisory context check
npx --no-install ccr hooks check 2>/dev/null || echo "CCR: context check unavailable; commit continues." >&2
# ccr:end`,
  },
  "post-commit": {
    start: "# ccr:start - post-commit context check",
    end: "# ccr:end",
    block: `# ccr:start - post-commit context check
npx --no-install ccr hooks after-commit || echo "CCR: post-commit context check unavailable." >&2
# ccr:end`,
  },
};

interface ManagedBlock {
  start: number;
  end: number;
}

interface ResolvedHook {
  authorityRoot: string;
  path: string;
}

function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
  );
}

function nearestExistingDirectory(directory: string): string {
  let current = directory;
  while (!existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return current;
    current = parent;
  }
  return current;
}

function assertHookIsWithinAuthority(authorityRoot: string, hookPath: string): void {
  const resolvedAuthority = path.resolve(authorityRoot);
  if (!isWithin(resolvedAuthority, hookPath)) {
    throw new Error(`Refusing to manage Git hook outside the repository: ${hookPath}`);
  }

  const realAuthority = realpathSync(resolvedAuthority);
  const existingParent = nearestExistingDirectory(path.dirname(hookPath));
  if (!isWithin(realAuthority, realpathSync(existingParent))) {
    throw new Error(`Refusing to manage Git hook outside the repository: ${hookPath}`);
  }
  if (existsSync(hookPath) && !isWithin(realAuthority, realpathSync(hookPath))) {
    throw new Error(`Refusing to manage Git hook outside the repository: ${hookPath}`);
  }
}

function resolveHook(root: string, hookName: CcrHookName): ResolvedHook {
  let configured = "";
  try {
    configured = execFileSync("git", ["config", "--path", "--get", "core.hooksPath"], {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
    }).trim();
  } catch {
    configured = "";
  }

  if (configured) {
    const normalized = configured.replaceAll("\\", "/").replace(/\/+$/, "");
    const isHusky = normalized.endsWith("/_");
    const hooksRoot = isHusky ? normalized.slice(0, -2) : normalized;
    const hookPath = path.resolve(root, hooksRoot, hookName);
    return { authorityRoot: path.resolve(root), path: hookPath };
  }

  const hooksDirectory = execFileSync("git", ["rev-parse", "--git-path", "hooks"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  }).trim();
  const hookPath = path.resolve(root, hooksDirectory, hookName);
  const commonDirectory = execFileSync("git", ["rev-parse", "--git-common-dir"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  }).trim();
  return { authorityRoot: path.resolve(root, commonDirectory), path: hookPath };
}

function markerMatches(content: string, marker: string): RegExpMatchArray[] {
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Array.from(content.matchAll(new RegExp(`^${escaped}\\r?$`, "gm")));
}

function findManagedBlock(content: string, definition: HookDefinition): ManagedBlock | undefined {
  const starts = markerMatches(content, definition.start);
  const ends = markerMatches(content, definition.end);
  if (starts.length === 0 && ends.length === 0) return undefined;
  if (starts.length !== 1 || ends.length !== 1) {
    throw new Error("Existing hook has malformed or duplicate CCR managed markers.");
  }

  const start = starts[0]?.index;
  const endStart = ends[0]?.index;
  const endLength = ends[0]?.[0].length;
  if (
    start === undefined ||
    endStart === undefined ||
    endLength === undefined ||
    endStart < start
  ) {
    throw new Error("Existing hook has malformed or duplicate CCR managed markers.");
  }
  return { start, end: endStart + endLength };
}

function removeManagedBlock(content: string, block: ManagedBlock): string {
  let start = block.start;
  if (content.slice(start - 2, start) === "\r\n") start -= 2;
  else if (content[start - 1] === "\n") start -= 1;

  let end = block.end;
  if (content.slice(end, end + 2) === "\r\n") end += 2;
  else if (content[end] === "\n") end += 1;

  const before = content.slice(0, start);
  const after = content.slice(end);
  const separator =
    before && after && !before.endsWith("\n") && !after.startsWith("\n") ? "\n" : "";
  return `${before}${separator}${after}`;
}

/** Removes only CCR's marked block and preserves other hook commands. */
export async function removeContextHook(
  root: string,
  hookName: CcrHookName = "pre-commit",
): Promise<HookResult> {
  const definition = HOOK_DEFINITIONS[hookName];
  const resolved = resolveHook(root, hookName);
  assertHookIsWithinAuthority(resolved.authorityRoot, resolved.path);
  const hookPath = resolved.path;
  const existing = await readTextIfExists(hookPath);
  if (existing === undefined) return { path: hookPath, status: "not-installed" };
  const managedBlock = findManagedBlock(existing, definition);
  if (!managedBlock) return { path: hookPath, status: "not-installed" };
  await writeTextAtomic(hookPath, removeManagedBlock(existing, managedBlock));
  await chmod(hookPath, 0o755);
  return { path: hookPath, status: "removed" };
}

/** Inspects a legacy native block without throwing for unsupported or unsafe hook layouts. */
export async function readContextHookStatus(
  root: string,
  hookName: CcrHookName = "pre-commit",
): Promise<HookResult> {
  const definition = HOOK_DEFINITIONS[hookName];
  let hookPath = path.resolve(root, ".git", "hooks", hookName);
  try {
    const resolved = resolveHook(root, hookName);
    hookPath = resolved.path;
    assertHookIsWithinAuthority(resolved.authorityRoot, hookPath);
    const existing = await readTextIfExists(hookPath);
    if (existing === undefined) return { path: hookPath, status: "not-installed" };
    const managedBlock = findManagedBlock(existing, definition);
    if (!managedBlock) return { path: hookPath, status: "not-installed" };
    const managed = existing.slice(managedBlock.start, managedBlock.end);
    return { path: hookPath, status: managed === definition.block ? "current" : "stale" };
  } catch {
    return { path: hookPath, status: "unsupported" };
  }
}

/** Returns whether the repository-aware skill has unfinished provenance-managed hook state. */
export function hasSkillManagedHookState(root: string): boolean {
  return existsSync(path.join(root, ".ccr", "private", "hooks-state.json"));
}

/** Removes CCR's legacy marked blocks from both advisory hooks. */
export async function removeAllContextHooks(root: string): Promise<{
  preCommit: HookResult;
  postCommit: HookResult;
}> {
  const preCommit = await removeContextHook(root, "pre-commit");
  const postCommit = await removeContextHook(root, "post-commit");
  return { preCommit, postCommit };
}
