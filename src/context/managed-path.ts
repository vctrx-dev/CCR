import { createHash, randomUUID } from "node:crypto";
import type { Dirent } from "node:fs";
import {
  type FileHandle,
  lstat,
  mkdir,
  open,
  readdir,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { isFileNotFound, readBoundedTextIfExists, readTextIfExists } from "./bounded-text";

/**
 * Repository-contained filesystem operations. Managed writers build on this boundary so path
 * containment, symlink rejection, and atomic replacement cannot drift between workflows.
 */

function ignoreError(): undefined {
  return undefined;
}

/** Rejects absolute, escaping, or symlinked managed paths before repository writes/deletes. */
export async function assertSafeManagedPath(root: string, relativePath: string): Promise<string> {
  if (path.isAbsolute(relativePath)) throw new Error("Managed path must be repository-relative.");
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, relativePath);
  if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("Managed path escapes the repository.");
  }
  let current = resolvedRoot;
  for (const segment of path.relative(resolvedRoot, target).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      if ((await lstat(current)).isSymbolicLink()) {
        throw new Error(`Managed path crosses a symbolic link: ${relativePath}`);
      }
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") break;
      throw error;
    }
  }
  return target;
}

/** Returns the Git-compatible executable mode for one safe regular worktree file. */
export async function readRegularFileGitMode(
  root: string,
  relativePath: string,
): Promise<"100644" | "100755" | undefined> {
  try {
    const details = await lstat(await assertSafeManagedPath(root, relativePath));
    if (!details.isFile()) return undefined;
    return (details.mode & 0o111) === 0 ? "100644" : "100755";
  } catch (error: unknown) {
    if (isFileNotFound(error)) return undefined;
    throw error;
  }
}

/** Replaces one text file atomically and removes its temporary file after a failed rename. */
export async function writeTextAtomic(target: string, content: string): Promise<void> {
  const temporary = `${target}.ccr-${process.pid}-${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content, "utf8");
    for (let attempt = 0; ; attempt += 1) {
      try {
        await rename(temporary, target);
        break;
      } catch (error: unknown) {
        const isTransientWindowsAccessError =
          process.platform === "win32" &&
          error instanceof Error &&
          "code" in error &&
          (error.code === "EPERM" || error.code === "EACCES");
        if (!isTransientWindowsAccessError || attempt >= 5) throw error;
        await delay(10 * 2 ** attempt);
      }
    }
  } catch (error: unknown) {
    await unlink(temporary).catch(ignoreError);
    throw error;
  }
}

/** Creates parent directories and atomically writes one verified repository-relative file. */
export async function writeManagedText(
  root: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const target = await assertSafeManagedPath(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await assertSafeManagedPath(root, relativePath);
  await writeTextAtomic(target, content);
}

/**
 * Creates one contained, non-symlinked managed file without replacing an existing path. This is
 * the allocation boundary for concurrent journal and generated-artifact creators.
 */
export async function createManagedTextExclusive(
  root: string,
  relativePath: string,
  content: string,
): Promise<boolean> {
  const target = await assertSafeManagedPath(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await assertSafeManagedPath(root, relativePath);
  let handle: FileHandle;
  try {
    handle = await open(target, "wx");
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") return false;
    throw error;
  }
  try {
    await handle.writeFile(content, "utf8");
    await handle.close();
    return true;
  } catch (error: unknown) {
    await handle.close().catch(ignoreError);
    await unlink(target).catch(ignoreError);
    throw error;
  }
}

/** Safely reads an optional managed text file after containment and symlink checks. */
export async function readManagedTextIfExists(
  root: string,
  relativePath: string,
): Promise<string | undefined> {
  return readTextIfExists(await assertSafeManagedPath(root, relativePath));
}

/**
 * Fingerprints a bounded managed directory so headless workflows can reject edits to ignored CCR
 * files as well as Git-visible files. Symlinks and unexpectedly large trees fail closed.
 */
export async function fingerprintManagedTree(
  root: string,
  relativeDirectory: string,
  maxFiles = 1_000,
  maxCharactersPerFile = 64_000,
): Promise<Map<string, string>> {
  const fingerprints = new Map<string, string>();
  const pending = [relativeDirectory];
  while (pending.length > 0) {
    const directory = pending.pop();
    if (directory === undefined) break;
    const absoluteDirectory = await assertSafeManagedPath(root, directory);
    let entries: Dirent[];
    try {
      entries = await readdir(absoluteDirectory, { withFileTypes: true });
    } catch (error: unknown) {
      if (isFileNotFound(error)) continue;
      throw error;
    }
    for (const entry of entries) {
      const relativePath = path.join(directory, entry.name).replaceAll(path.sep, "/");
      if (entry.isSymbolicLink()) {
        throw new Error(`Managed path is a symbolic link: ${relativePath}`);
      }
      if (entry.isDirectory()) {
        pending.push(relativePath);
        continue;
      }
      if (!entry.isFile()) throw new Error(`Managed path is not a regular file: ${relativePath}`);
      if (fingerprints.size >= maxFiles) throw new Error("Managed tree exceeds the file limit.");
      const bounded = await readBoundedTextIfExists(
        await assertSafeManagedPath(root, relativePath),
        maxCharactersPerFile,
      );
      if (bounded === undefined || bounded.isTruncated) {
        throw new Error(`Managed file exceeds the content limit: ${relativePath}`);
      }
      fingerprints.set(relativePath, createHash("sha256").update(bounded.content).digest("hex"));
    }
  }
  return fingerprints;
}
