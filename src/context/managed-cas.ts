import { createHash } from "node:crypto";
import { unlink } from "node:fs/promises";
import { isFileNotFound, readBoundedTextIfExists } from "./bounded-text";
import { tryAcquireManagedLock } from "./managed-lock";
import { assertSafeManagedPath, writeManagedText } from "./managed-path";

/**
 * Compare-and-swap operations for managed text. These serialize cooperating writers through a
 * path-derived lock and never overwrite content that differs from the caller's complete snapshot.
 */

function managedWriteLockPath(relativePath: string): string {
  const lockKey = createHash("sha256").update(relativePath).digest("hex");
  return `.ccr/private/managed-write-locks/${lockKey}.lock`;
}

async function managedTextMatches(
  root: string,
  relativePath: string,
  expectedContent: string | undefined,
): Promise<boolean> {
  const maximumCharacters = Math.max((expectedContent?.length ?? 0) + 1, 1);
  const bounded = await readBoundedTextIfExists(
    await assertSafeManagedPath(root, relativePath),
    maximumCharacters,
  );
  if (bounded === undefined) return expectedContent === undefined;
  return (
    expectedContent !== undefined && !bounded.isTruncated && bounded.content === expectedContent
  );
}

/**
 * Replaces one contained, non-symlinked managed file only when its complete UTF-8 content still
 * matches the caller's observation. Cooperating writers serialize through a token-owned local lock.
 */
export async function writeManagedTextIfUnchanged(
  root: string,
  relativePath: string,
  expectedContent: string | undefined,
  content: string,
): Promise<boolean> {
  const release = await tryAcquireManagedLock(root, managedWriteLockPath(relativePath));
  if (release === undefined) return false;
  try {
    if (!(await managedTextMatches(root, relativePath, expectedContent))) return false;
    await writeManagedText(root, relativePath, content);
    return true;
  } finally {
    await release();
  }
}

/**
 * Deletes one contained, non-symlinked managed text file only while its complete content matches
 * the caller's observation. Missing, replaced, or concurrently locked paths return false.
 */
export async function deleteManagedTextIfUnchanged(
  root: string,
  relativePath: string,
  expectedContent: string,
): Promise<boolean> {
  const release = await tryAcquireManagedLock(root, managedWriteLockPath(relativePath));
  if (release === undefined) return false;
  try {
    if (!(await managedTextMatches(root, relativePath, expectedContent))) return false;
    const target = await assertSafeManagedPath(root, relativePath);
    try {
      await unlink(target);
      return true;
    } catch (error: unknown) {
      if (isFileNotFound(error)) return false;
      throw error;
    }
  } finally {
    await release();
  }
}
