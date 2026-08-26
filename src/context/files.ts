import { createHash, randomUUID } from "node:crypto";
import type { Dirent } from "node:fs";
import {
  type FileHandle,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const MAX_UTF8_BYTES_PER_UTF16_CODE_UNIT = 3;
const UTF8_BOUNDARY_BYTES = 4;

export interface BoundedText {
  content: string;
  isTruncated: boolean;
}

/**
 * Shared repository filesystem boundary. New managed-file features must use these helpers so path
 * containment, symlink checks, and atomic writes stay consistent; generalize this code, do not bypass it.
 */

/** Returns whether a filesystem error represents an absent path. */
export function isFileNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function ignoreError(): undefined {
  return undefined;
}

async function unlinkIfExists(target: string): Promise<void> {
  try {
    await unlink(target);
  } catch (error: unknown) {
    if (!isFileNotFound(error)) throw error;
  }
}

/** Reads optional UTF-8 text without hiding errors other than a missing file. */
export async function readTextIfExists(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error: unknown) {
    if (isFileNotFound(error)) return undefined;
    throw error;
  }
}

function boundedReadByteLimit(maxCharacters: number): number {
  const maxSafeCharacters = Math.floor(
    (Number.MAX_SAFE_INTEGER - UTF8_BOUNDARY_BYTES) / MAX_UTF8_BYTES_PER_UTF16_CODE_UNIT,
  );
  if (
    !Number.isSafeInteger(maxCharacters) ||
    maxCharacters < 1 ||
    maxCharacters > maxSafeCharacters
  ) {
    throw new Error("Bounded text reads require a positive safe character limit.");
  }
  return maxCharacters * MAX_UTF8_BYTES_PER_UTF16_CODE_UNIT + UTF8_BOUNDARY_BYTES;
}

/**
 * Reads a bounded UTF-8 prefix without first loading the entire file. Use this at content-export
 * boundaries; callers own their user-facing truncation marker so each surface stays actionable.
 */
export async function readBoundedTextIfExists(
  filePath: string,
  maxCharacters: number,
): Promise<BoundedText | undefined> {
  const byteLimit = boundedReadByteLimit(maxCharacters);
  let handle: FileHandle;
  try {
    handle = await open(filePath, "r");
  } catch (error: unknown) {
    if (isFileNotFound(error)) return undefined;
    throw error;
  }
  try {
    const before = await handle.stat();
    const bytesToRead = Math.min(before.size, byteLimit);
    if (bytesToRead === 0) {
      const after = await handle.stat();
      return { content: "", isTruncated: after.size > 0 };
    }
    const buffer = Buffer.alloc(bytesToRead);
    const { bytesRead } = await handle.read(buffer, 0, bytesToRead, 0);
    const after = await handle.stat();
    const text = buffer.subarray(0, bytesRead).toString("utf8");
    return {
      content: text.slice(0, maxCharacters),
      isTruncated: text.length > maxCharacters || after.size > bytesRead,
    };
  } finally {
    await handle.close();
  }
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

/** Replaces one text file atomically and removes its temporary file after a failed rename. */
export async function writeTextAtomic(target: string, content: string): Promise<void> {
  const temporary = `${target}.ccr-${process.pid}-${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content, "utf8");
    await rename(temporary, target);
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
      if (entry.isSymbolicLink())
        throw new Error(`Managed path is a symbolic link: ${relativePath}`);
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

/** Atomically acquires a repository-contained local lock; an absent result means another process owns it. */
export async function tryAcquireManagedLock(
  root: string,
  relativePath: string,
): Promise<(() => Promise<void>) | undefined> {
  const target = await assertSafeManagedPath(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await assertSafeManagedPath(root, relativePath);
  const openExclusive = async (): Promise<FileHandle | undefined> => {
    try {
      return await open(target, "wx");
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "EEXIST") return undefined;
      throw error;
    }
  };
  let handle = await openExclusive();
  if (handle === undefined) {
    const existing = await readBoundedTextIfExists(target, 200).catch(() => undefined);
    let isStale = true;
    if (existing && !existing.isTruncated) {
      try {
        const value: unknown = JSON.parse(existing.content);
        if (typeof value === "object" && value !== null && "pid" in value && "createdAt" in value) {
          const pid = value.pid;
          const createdAt = value.createdAt;
          if (typeof pid === "number" && Number.isInteger(pid) && typeof createdAt === "number") {
            let isAlive = true;
            try {
              process.kill(pid, 0);
            } catch (error: unknown) {
              isAlive = error instanceof Error && "code" in error && error.code === "EPERM";
            }
            isStale = !isAlive || Date.now() - createdAt > 15 * 60_000;
          }
        }
      } catch {
        isStale = true;
      }
    }
    if (!isStale) return undefined;
    await unlinkIfExists(target);
    handle = await openExclusive();
    if (handle === undefined) return undefined;
  }
  try {
    await handle.writeFile(
      `${JSON.stringify({ pid: process.pid, createdAt: Date.now() })}\n`,
      "utf8",
    );
    await handle.close();
  } catch (error: unknown) {
    await handle.close().catch(ignoreError);
    await unlink(target).catch(ignoreError);
    throw error;
  }
  return async () => {
    await unlinkIfExists(target);
  };
}
