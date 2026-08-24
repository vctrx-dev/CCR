import { randomUUID } from "node:crypto";
import {
  type FileHandle,
  lstat,
  mkdir,
  open,
  readFile,
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
    await unlink(temporary).catch(() => undefined);
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
