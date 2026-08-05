import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { chmod, mkdir } from "node:fs/promises";
import path from "node:path";
import { readTextIfExists, writeTextAtomic } from "./files";
import { ensureLocalIgnoreRules } from "./ignore";
import type { IgnoreOutcome } from "./ignore";

/**
 * Safe composition for CCR's advisory Git hook integration. Future hook types should reuse its
 * path validation and marked-block ownership rules, extending the definition rather than overwriting
 * another tool's hook.
 */

export type CcrHookName = "pre-commit" | "post-commit";

export interface HookResult {
  path: string;
  status: "installed" | "already-installed" | "removed" | "not-installed";
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
  isHusky: boolean;
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

function assertHookIsInRepository(root: string, hookPath: string): void {
  const resolvedRoot = path.resolve(root);
  if (!isWithin(resolvedRoot, hookPath)) {
    throw new Error(`Refusing to manage Git hook outside the repository: ${hookPath}`);
  }

  const realRoot = realpathSync(resolvedRoot);
  const existingParent = nearestExistingDirectory(path.dirname(hookPath));
  if (!isWithin(realRoot, realpathSync(existingParent))) {
    throw new Error(`Refusing to manage Git hook outside the repository: ${hookPath}`);
  }
  if (existsSync(hookPath) && !isWithin(realRoot, realpathSync(hookPath))) {
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
    assertHookIsInRepository(root, hookPath);
    return { isHusky, path: hookPath };
  }

  const hooksDirectory = execFileSync("git", ["rev-parse", "--git-path", "hooks"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  }).trim();
  const hookPath = path.resolve(root, hooksDirectory, hookName);
  assertHookIsInRepository(root, hookPath);
  return { isHusky: false, path: hookPath };
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

function isPosixShellHook(content: string): boolean {
  const firstLine = content.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
  return /^#!\s*(?:\/usr\/bin\/env\s+(?:-S\s+)?)?(?:\S*\/)?(?:sh|ash|bash|dash|ksh|zsh)(?:\s|$)/.test(
    firstLine,
  );
}

function assertComposableHook(content: string, isHusky: boolean, hookPath: string): void {
  if (content.trim() === "" || isPosixShellHook(content)) return;
  const firstLine = content.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
  if (isHusky && !firstLine.startsWith("#!")) return;
  throw new Error(
    `Cannot install CCR hook at ${hookPath}: existing hook is not a recognized POSIX shell or Husky hook.`,
  );
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

/** Installs a marked advisory block while preserving an existing hook of the same name. */
export async function installContextHook(
  root: string,
  hookName: CcrHookName = "pre-commit",
): Promise<HookResult> {
  const definition = HOOK_DEFINITIONS[hookName];
  const hookPath = resolveHook(root, hookName).path;
  const existing = await readTextIfExists(hookPath);
  if (existing !== undefined) {
    const managedBlock = findManagedBlock(existing, definition);
    assertComposableHook(existing, resolveHook(root, hookName).isHusky, hookPath);
    if (managedBlock) {
      const managed = existing.slice(managedBlock.start, managedBlock.end);
      if (managed === definition.block) return { path: hookPath, status: "already-installed" };
      await writeTextAtomic(
        hookPath,
        `${existing.slice(0, managedBlock.start)}${definition.block}${existing.slice(managedBlock.end)}`,
      );
      await chmod(hookPath, 0o755);
      return { path: hookPath, status: "installed" };
    }
  }

  const base = existing?.trim() ? existing : "#!/bin/sh";
  const separator = base.endsWith("\n") ? "\n" : "\n\n";
  await mkdir(path.dirname(hookPath), { recursive: true });
  await writeTextAtomic(hookPath, `${base}${separator}${definition.block}\n`);
  await chmod(hookPath, 0o755);
  return { path: hookPath, status: "installed" };
}

/** Removes only CCR's marked block and preserves other hook commands. */
export async function removeContextHook(
  root: string,
  hookName: CcrHookName = "pre-commit",
): Promise<HookResult> {
  const definition = HOOK_DEFINITIONS[hookName];
  const hookPath = resolveHook(root, hookName).path;
  const existing = await readTextIfExists(hookPath);
  if (existing === undefined) return { path: hookPath, status: "not-installed" };
  const managedBlock = findManagedBlock(existing, definition);
  if (!managedBlock) return { path: hookPath, status: "not-installed" };
  await writeTextAtomic(hookPath, removeManagedBlock(existing, managedBlock));
  await chmod(hookPath, 0o755);
  return { path: hookPath, status: "removed" };
}

/** Reports whether CCR's marked block is installed in the named hook. */
export async function readContextHookStatus(
  root: string,
  hookName: CcrHookName = "pre-commit",
): Promise<HookResult> {
  const definition = HOOK_DEFINITIONS[hookName];
  const hookPath = resolveHook(root, hookName).path;
  const existing = await readTextIfExists(hookPath);
  return {
    path: hookPath,
    status:
      existing !== undefined && findManagedBlock(existing, definition)
        ? "already-installed"
        : "not-installed",
  };
}

/** Installs both advisory hooks and the local-continuity ignore rules in one idempotent step. */
export async function installAllContextHooks(root: string): Promise<{
  preCommit: HookResult;
  postCommit: HookResult;
  ignore: IgnoreOutcome;
}> {
  const preCommit = await installContextHook(root, "pre-commit");
  const postCommit = await installContextHook(root, "post-commit");
  const ignore = await ensureLocalIgnoreRules(root);
  return { preCommit, postCommit, ignore };
}

/** Removes CCR's marked blocks from both advisory hooks. */
export async function removeAllContextHooks(root: string): Promise<{
  preCommit: HookResult;
  postCommit: HookResult;
}> {
  const preCommit = await removeContextHook(root, "pre-commit");
  const postCommit = await removeContextHook(root, "post-commit");
  return { preCommit, postCommit };
}
