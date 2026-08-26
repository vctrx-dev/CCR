import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { chmod } from "node:fs/promises";
import path from "node:path";
import { readTextIfExists, writeTextAtomic } from "./files";
import {
  type ManagedBlock,
  inspectManagedBlock,
  managedBlock,
  removeManagedBlock,
} from "./managed-block";

/**
 * Conservative inspection and cleanup for CCR's legacy native hook blocks. Repository-adaptive
 * integrations are owned by the ccr-hooks skill and its provenance state, not this compatibility
 * boundary.
 */

export type CcrHookName = "pre-commit" | "post-commit";

export interface HookResult {
  path: string;
  status:
    | "current"
    | "stale"
    | "removed"
    | "not-installed"
    | "malformed"
    | "unsafe"
    | "unavailable";
}

const HOOK_DEFINITIONS: Record<CcrHookName, ManagedBlock> = {
  "pre-commit": managedBlock(`# ccr:start - advisory context check
npx --no-install ccr hooks pre-commit || echo "CCR: context check unavailable; commit continues." >&2
# ccr:end`),
  "post-commit": managedBlock(`# ccr:start - post-commit context check
npx --no-install ccr hooks post-commit || echo "CCR: post-commit context check unavailable." >&2
# ccr:end`),
};

interface ResolvedHook {
  authorityRoot: string;
  path: string;
}

interface HookRemovalPlan {
  content?: string;
  original?: string;
  result: HookResult;
}

const PREVIEW_PLANS = Symbol("context-hook-removal-preview");

/** Opaque validated plan; pass it back to removal to detect drift before either hook is written. */
export interface ContextHookRemovalPreview {
  readonly [PREVIEW_PLANS]: {
    plans: readonly [HookRemovalPlan, HookRemovalPlan];
    root: string;
  };
}

class UnsafeHookPathError extends Error {}

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
    throw new UnsafeHookPathError(
      `Refusing to manage Git hook outside the repository: ${hookPath}`,
    );
  }

  const realAuthority = realpathSync(resolvedAuthority);
  const existingParent = nearestExistingDirectory(path.dirname(hookPath));
  if (!isWithin(realAuthority, realpathSync(existingParent))) {
    throw new UnsafeHookPathError(
      `Refusing to manage Git hook outside the repository: ${hookPath}`,
    );
  }
  if (existsSync(hookPath) && !isWithin(realAuthority, realpathSync(hookPath))) {
    throw new UnsafeHookPathError(
      `Refusing to manage Git hook outside the repository: ${hookPath}`,
    );
  }
}

function resolveHook(root: string, hookName: CcrHookName): ResolvedHook {
  let configured = "";
  try {
    configured = execFileSync("git", ["config", "--path", "--get", "core.hooksPath"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
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
    stdio: ["ignore", "pipe", "ignore"],
    windowsHide: true,
  }).trim();
  const hookPath = path.resolve(root, hooksDirectory, hookName);
  const commonDirectory = execFileSync("git", ["rev-parse", "--git-common-dir"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    windowsHide: true,
  }).trim();
  return { authorityRoot: path.resolve(root, commonDirectory), path: hookPath };
}

async function planContextHookRemoval(
  root: string,
  hookName: CcrHookName,
): Promise<HookRemovalPlan> {
  const definition = HOOK_DEFINITIONS[hookName];
  const resolved = resolveHook(root, hookName);
  assertHookIsWithinAuthority(resolved.authorityRoot, resolved.path);
  const existing = await readTextIfExists(resolved.path);
  if (existing === undefined) {
    return { result: { path: resolved.path, status: "not-installed" } };
  }
  const inspection = inspectManagedBlock(existing, definition);
  if (inspection.status === "conflict") {
    throw new Error(`CCR managed block conflict in ${resolved.path}.`);
  }
  if (inspection.status === "absent") {
    return { original: existing, result: { path: resolved.path, status: "not-installed" } };
  }
  return {
    content: removeManagedBlock(existing, definition, resolved.path, {
      terminalSeparator: "preserve",
    }),
    original: existing,
    result: { path: resolved.path, status: "removed" },
  };
}

async function validateHookRemovalPlans(plans: readonly HookRemovalPlan[]): Promise<void> {
  for (const plan of plans) {
    if ((await readTextIfExists(plan.result.path)) !== plan.original) {
      throw new Error(`Git hook changed after preview: ${plan.result.path}`);
    }
  }
}

async function applyHookRemovalPlans(plans: readonly HookRemovalPlan[]): Promise<void> {
  await validateHookRemovalPlans(plans);
  for (const plan of plans) {
    if (plan.content === undefined) continue;
    await writeTextAtomic(plan.result.path, plan.content);
    await chmod(plan.result.path, 0o755);
  }
}

/** Removes only CCR's marked block and preserves other hook commands. */
export async function removeContextHook(
  root: string,
  hookName: CcrHookName = "pre-commit",
): Promise<HookResult> {
  const plan = await planContextHookRemoval(root, hookName);
  await applyHookRemovalPlans([plan]);
  return plan.result;
}

/** Inspects a legacy native block without throwing for malformed, unsafe, or unavailable layouts. */
export async function readContextHookStatus(
  root: string,
  hookName: CcrHookName = "pre-commit",
): Promise<HookResult> {
  const definition = HOOK_DEFINITIONS[hookName];
  let hookPath = path.resolve(root, ".git", "hooks", hookName);
  let resolved: ResolvedHook;
  try {
    resolved = resolveHook(root, hookName);
    hookPath = resolved.path;
  } catch {
    return { path: hookPath, status: "unavailable" };
  }
  try {
    assertHookIsWithinAuthority(resolved.authorityRoot, hookPath);
  } catch (error) {
    return {
      path: hookPath,
      status: error instanceof UnsafeHookPathError ? "unsafe" : "unavailable",
    };
  }
  try {
    const existing = await readTextIfExists(hookPath);
    if (existing === undefined) return { path: hookPath, status: "not-installed" };
    const inspection = inspectManagedBlock(existing, definition);
    if (inspection.status === "conflict") return { path: hookPath, status: "malformed" };
    if (inspection.status === "absent") return { path: hookPath, status: "not-installed" };
    const managed = existing.slice(inspection.start, inspection.end);
    return {
      path: hookPath,
      status: managed.replaceAll("\r\n", "\n") === definition.content ? "current" : "stale",
    };
  } catch {
    return { path: hookPath, status: "unavailable" };
  }
}

/** Validates both legacy hooks and captures exact bytes before cleanup starts. */
export async function previewContextHookRemoval(root: string): Promise<ContextHookRemovalPreview> {
  const preCommit = await planContextHookRemoval(root, "pre-commit");
  const postCommit = await planContextHookRemoval(root, "post-commit");
  return { [PREVIEW_PLANS]: { plans: [preCommit, postCommit], root: path.resolve(root) } };
}

function hookRemovalPlans(
  root: string,
  preview: ContextHookRemovalPreview,
): readonly [HookRemovalPlan, HookRemovalPlan] {
  if (preview[PREVIEW_PLANS].root !== path.resolve(root)) {
    throw new Error("Hook removal preview belongs to a different repository.");
  }
  return preview[PREVIEW_PLANS].plans;
}

/** Revalidates a hook-removal preview without changing either hook. */
export async function validateContextHookRemoval(
  root: string,
  preview: ContextHookRemovalPreview,
): Promise<void> {
  await validateHookRemovalPlans(hookRemovalPlans(root, preview));
}

/** Removes CCR's legacy marked blocks from both advisory hooks. */
export async function removeAllContextHooks(
  root: string,
  preview?: ContextHookRemovalPreview,
): Promise<{
  preCommit: HookResult;
  postCommit: HookResult;
}> {
  const plan = preview ?? (await previewContextHookRemoval(root));
  const [preCommit, postCommit] = hookRemovalPlans(root, plan);
  await applyHookRemovalPlans([preCommit, postCommit]);
  return { preCommit: preCommit.result, postCommit: postCommit.result };
}
