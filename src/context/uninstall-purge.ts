import { createHash } from "node:crypto";
import { lstat, open, readdir, rmdir, unlink } from "node:fs/promises";
import path from "node:path";
import { assertSafeManagedPath, isFileNotFound } from "./files";
import { MANAGED_ARTIFACTS } from "./managed-artifacts";

// These locks are held during uninstall and released before the final empty directories are removed.
const ACTIVE_LOCKS = new Set([
  ".ccr/private/managed-lifecycle.lock",
  ".ccr/private/journal-mutation.lock",
]);
const SCAFFOLD = new Set([".ccr", ".ccr/private", ".ccr/private/managed-write-locks"]);
const MAX_ENTRIES = 10_000;

export interface PurgeSnapshot {
  files: Map<string, string>;
  directories: string[];
}

async function fileFingerprint(root: string, relativePath: string): Promise<string> {
  const target = await assertSafeManagedPath(root, relativePath);
  const details = await lstat(target);
  if (!details.isFile()) throw new Error(`Purge path is not a regular file: ${relativePath}`);
  const handle = await open(target, "r");
  try {
    const opened = await handle.stat();
    if (opened.ino !== details.ino || opened.dev !== details.dev) {
      throw new Error(`Purge path changed while reading: ${relativePath}`);
    }
    const hash = createHash("sha256");
    const buffer = Buffer.alloc(65_536);
    let position = 0;
    while (position < details.size) {
      const { bytesRead } = await handle.read(
        buffer,
        0,
        Math.min(buffer.length, details.size - position),
        position,
      );
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
    await assertSafeManagedPath(root, relativePath);
    const after = await lstat(target);
    if (
      after.ino !== details.ino ||
      after.dev !== details.dev ||
      after.size !== details.size ||
      after.mtimeMs !== details.mtimeMs
    ) {
      throw new Error(`Purge path changed while reading: ${relativePath}`);
    }
    return `${details.dev}:${details.ino}:${details.size}:${hash.digest("hex")}`;
  } finally {
    await handle.close();
  }
}

/** Reads only hashes and paths; binary caches and private contents never enter the preview. */
export async function snapshotPurgeTree(root: string): Promise<PurgeSnapshot> {
  const snapshot: PurgeSnapshot = { files: new Map(), directories: [] };
  const pending = [".ccr"];
  let count = 0;
  while (pending.length > 0) {
    const directory = pending.pop();
    if (directory === undefined) break;
    const target = await assertSafeManagedPath(root, directory);
    try {
      if (!(await lstat(target)).isDirectory())
        throw new Error(`Purge path is not a directory: ${directory}`);
      if (!SCAFFOLD.has(directory)) snapshot.directories.push(directory);
      const entries = await readdir(target, { withFileTypes: true });
      if (directory === ".ccr/private/managed-write-locks" && entries.length > 0) {
        throw new Error("CCR files have pending write locks; cleanup stopped.");
      }
      for (const entry of entries) {
        if (++count > MAX_ENTRIES)
          throw new Error("CCR cleanup exceeds the 10000-entry safety limit.");
        const relativePath = `${directory}/${entry.name}`;
        await assertSafeManagedPath(root, relativePath);
        if (ACTIVE_LOCKS.has(relativePath)) continue;
        if (entry.isDirectory()) pending.push(relativePath);
        else if (entry.isFile())
          snapshot.files.set(relativePath, await fileFingerprint(root, relativePath));
        else throw new Error(`Cannot safely purge this path: ${relativePath}`);
      }
    } catch (error: unknown) {
      if (isFileNotFound(error) && directory === ".ccr") continue;
      throw error;
    }
  }
  snapshot.directories.sort();
  return snapshot;
}

/** Rejects additions, replacements, content changes, and unsafe paths since the purge preview. */
export async function validatePurgeTree(root: string, expected: PurgeSnapshot): Promise<void> {
  const current = await snapshotPurgeTree(root);
  if (
    JSON.stringify(current.directories) !== JSON.stringify(expected.directories) ||
    current.files.size !== expected.files.size ||
    [...expected.files].some(([file, fingerprint]) => current.files.get(file) !== fingerprint)
  ) {
    throw new Error("CCR data changed after preview; cleanup stopped.");
  }
}

/** Deletes only the enumerated, rechecked files, never recursively follows or removes a tree. */
export async function applyPurgeTree(root: string, expected: PurgeSnapshot): Promise<void> {
  await validatePurgeTree(root, expected);
  const files = [...expected.files].sort(
    ([a], [b]) =>
      Number(a === ".ccr/private/hooks-state.json") - Number(b === ".ccr/private/hooks-state.json"),
  );
  for (const [relativePath, fingerprint] of files) {
    if ((await fileFingerprint(root, relativePath)) !== fingerprint) {
      throw new Error(`CCR data changed after preview: ${relativePath}`);
    }
    await unlink(await assertSafeManagedPath(root, relativePath));
  }
  for (const directory of [...expected.directories].sort((a, b) => b.length - a.length)) {
    await rmdir(await assertSafeManagedPath(root, directory));
  }
}

/** Runs after lock release; rmdir preserves any new or unexpected content instead of forcing deletion. */
export async function finishPurgeTree(root: string): Promise<void> {
  for (const directory of [".ccr/private/managed-write-locks", ".ccr/private", ".ccr"]) {
    try {
      await rmdir(await assertSafeManagedPath(root, directory));
    } catch (error: unknown) {
      if (isFileNotFound(error)) continue;
      throw new Error(`CCR cleanup left ${directory} because it is not safely empty.`, {
        cause: error,
      });
    }
  }
  const skillDirectories = new Set(
    MANAGED_ARTIFACTS.filter((artifact) => artifact.kind === "skill").flatMap((artifact) => [
      path.dirname(artifact.path),
      `.claude/skills/${artifact.path.split("/")[2]}`,
    ]),
  );
  for (const directory of [...skillDirectories].sort((a, b) => b.length - a.length)) {
    try {
      await rmdir(await assertSafeManagedPath(root, directory));
    } catch (error: unknown) {
      if (
        isFileNotFound(error) ||
        (error instanceof Error &&
          "code" in error &&
          ["ENOTEMPTY", "EEXIST"].includes(String(error.code)))
      )
        continue;
      throw error;
    }
  }
}
