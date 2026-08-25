import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
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
