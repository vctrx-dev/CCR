import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach } from "vitest";

/** Shared async command runner and temporary-directory cleanup for filesystem-backed test suites. */
export const runCommand = promisify(execFile);

/** Registers cleanup for roots that each test suite adds to the returned registry. */
export function createTemporaryRootRegistry(): string[] {
  const roots: string[] = [];
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });
  return roots;
}

/**
 * Creates an isolated Git repository with a deterministic local author and registers it for
 * cleanup. Keep repository identity local so tests never depend on or mutate developer settings.
 */
export async function createTemporaryGitRepository(
  roots: string[],
  prefix: string,
  initialBranch?: string,
): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  roots.push(root);
  const branchArguments = initialBranch ? ["-b", initialBranch] : [];
  await runCommand("git", ["init", "--quiet", ...branchArguments], { cwd: root });
  await runCommand("git", ["config", "user.name", "CCR Test"], { cwd: root });
  await runCommand("git", ["config", "user.email", "ccr@example.test"], { cwd: root });
  return root;
}
