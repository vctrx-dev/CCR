import { createHash, randomUUID } from "node:crypto";
import type { Dirent, Stats } from "node:fs";
import { lstat, mkdir, readdir, rmdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { isFileNotFound, readBoundedTextIfExists } from "./bounded-text";
import { assertSafeManagedPath } from "./managed-path";

/**
 * Token-owned repository lock boundary. Callers may attempt immediate acquisition or use the
 * bounded retry wrapper. Reclamation removes only an observed token and empty containers, never
 * renames a mutable lock path. Live owners retain exclusivity regardless of operation duration.
 */

const INCOMPLETE_LOCK_GRACE_MS = 5_000;
const LOCK_OWNER_FILE_PATTERN = /^([a-f0-9-]{36})\.owner\.json$/u;
const MANAGED_WRITE_LOCK_GROUP = ".ccr/private/managed-write-locks";

/** Shared lock for setup, uninstall, configuration initialization, and context automation. */
export const MANAGED_LIFECYCLE_LOCK_PATH = ".ccr/private/managed-lifecycle.lock";

export interface ManagedLockRetryOptions {
  busyMessage: string;
  maximumAttempts: number;
  retryMilliseconds: number;
}

interface ManagedLockOwner {
  token: string;
  pid: number;
  createdAt: number;
}

interface ManagedLockObservation {
  identity: string;
  isStale: boolean;
  isDirectory: boolean;
  ownerFile?: string;
}

function ignoreError(): undefined {
  return undefined;
}

function isTransientLockObservationError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    ["EACCES", "ENOTDIR", "EPERM"].includes(String(error.code))
  );
}

async function unlinkIfExists(target: string): Promise<boolean> {
  try {
    await unlink(target);
    return true;
  } catch (error: unknown) {
    if (!isFileNotFound(error)) throw error;
    return false;
  }
}

function parseManagedLockOwner(
  content: string,
  expectedToken?: string,
): ManagedLockOwner | undefined {
  try {
    const value: unknown = JSON.parse(content);
    if (typeof value !== "object" || value === null) return undefined;
    if (!("pid" in value) || !("createdAt" in value)) return undefined;
    const pid = value.pid;
    const createdAt = value.createdAt;
    const token = "token" in value ? value.token : expectedToken;
    if (
      typeof token !== "string" ||
      (expectedToken !== undefined && token !== expectedToken) ||
      typeof pid !== "number" ||
      !Number.isSafeInteger(pid) ||
      pid < 1 ||
      typeof createdAt !== "number" ||
      !Number.isSafeInteger(createdAt) ||
      createdAt < 0
    ) {
      return undefined;
    }
    return { token, pid, createdAt };
  } catch {
    return undefined;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ESRCH") return false;
    return true;
  }
}

function managedLockIdentity(target: string, details: Stats): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        target,
        device: details.dev,
        inode: details.ino,
        mode: details.mode,
        birthtimeMs: details.birthtimeMs,
        ctimeMs: details.ctimeMs,
      }),
    )
    .digest("hex");
}

async function inspectManagedLockOwner(
  target: string,
  details: Stats,
): Promise<{ isStale: boolean; ownerFile?: string }> {
  if (details.isFile()) {
    const existing = await readBoundedTextIfExists(target, 300).catch(() => undefined);
    const owner = existing?.isTruncated
      ? undefined
      : parseManagedLockOwner(existing?.content ?? "", "legacy-lock-owner");
    return {
      isStale: owner !== undefined && !isProcessAlive(owner.pid),
    };
  }
  if (!details.isDirectory()) return { isStale: false };
  let entries: Dirent[];
  try {
    entries = await readdir(target, { withFileTypes: true });
  } catch (error: unknown) {
    if (isFileNotFound(error)) return { isStale: true };
    if (isTransientLockObservationError(error)) return { isStale: false };
    throw error;
  }
  if (entries.length === 1) {
    const entry = entries[0];
    const match = entry?.isFile() ? LOCK_OWNER_FILE_PATTERN.exec(entry.name) : null;
    if (entry !== undefined && match !== null) {
      const token = match[1];
      if (token !== undefined) {
        const existing = await readBoundedTextIfExists(path.join(target, entry.name), 300).catch(
          () => undefined,
        );
        const owner = existing?.isTruncated
          ? undefined
          : parseManagedLockOwner(existing?.content ?? "", token);
        if (owner !== undefined) {
          return { isStale: !isProcessAlive(owner.pid), ownerFile: entry.name };
        }
        // A partially written token may belong to a paused live creator; age cannot prove death.
        return { isStale: false };
      }
    }
  }
  return {
    isStale: entries.length === 0 && Date.now() - details.mtimeMs > INCOMPLETE_LOCK_GRACE_MS,
  };
}

async function observeManagedLock(target: string): Promise<ManagedLockObservation | undefined> {
  let details: Stats;
  try {
    details = await lstat(target);
  } catch (error: unknown) {
    if (isFileNotFound(error)) return undefined;
    throw error;
  }
  const identity = managedLockIdentity(target, details);
  const owner = await inspectManagedLockOwner(target, details);
  try {
    if (managedLockIdentity(target, await lstat(target)) !== identity) return undefined;
  } catch (error: unknown) {
    if (isFileNotFound(error)) return undefined;
    throw error;
  }
  return { identity, ...owner, isDirectory: details.isDirectory() };
}

async function reclaimManagedLock(
  target: string,
  observation: ManagedLockObservation,
): Promise<boolean> {
  try {
    if (observation.isDirectory) {
      // The unique owner filename is the fencing token: an old observation cannot unlink a
      // replacement owner's metadata. rmdir also refuses to remove a nonempty replacement.
      if (
        observation.ownerFile !== undefined &&
        !(await unlinkIfExists(path.join(target, observation.ownerFile)))
      )
        return false;
      await rmdir(target);
    } else {
      // New locks are directories, which unlink cannot remove if a legacy file was replaced.
      await unlink(target);
    }
    return true;
  } catch (error: unknown) {
    if (isFileNotFound(error)) return false;
    if (
      error instanceof Error &&
      "code" in error &&
      ["EACCES", "EEXIST", "EISDIR", "ENOTDIR", "ENOTEMPTY", "EPERM"].includes(String(error.code))
    ) {
      return false;
    }
    throw error;
  }
}

/**
 * Compare-and-swap writes share this grouping path. Remove it only after its final lock is gone so
 * callers retain serialization without leaving an empty implementation directory in `.ccr/private`.
 */
async function removeEmptyManagedWriteLockGroup(root: string, target: string): Promise<void> {
  const group = await assertSafeManagedPath(root, MANAGED_WRITE_LOCK_GROUP);
  if (path.resolve(path.dirname(target)) !== path.resolve(group)) return;
  try {
    await rmdir(group);
  } catch (error: unknown) {
    if (
      isFileNotFound(error) ||
      (error instanceof Error &&
        "code" in error &&
        ["EEXIST", "ENOTEMPTY"].includes(String(error.code)))
    ) {
      return;
    }
    throw error;
  }
}

/**
 * Atomically acquires a repository-contained, token-owned local lock. An absent result means a
 * live owner or a recently created incomplete owner holds it. Release cannot remove a replacement
 * owner's lock. Dead token owners and old empty locks are reclaimed without moving a live lock;
 * ambiguous containers are left untouched for human repair.
 */
export async function tryAcquireManagedLock(
  root: string,
  relativePath: string,
): Promise<(() => Promise<void>) | undefined> {
  const target = await assertSafeManagedPath(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await assertSafeManagedPath(root, relativePath);
  const createLockDirectory = async (): Promise<boolean> => {
    try {
      await mkdir(target);
      return true;
    } catch (error: unknown) {
      if (
        (error instanceof Error && "code" in error && error.code === "EEXIST") ||
        isTransientLockObservationError(error)
      ) {
        return false;
      }
      throw error;
    }
  };
  let isAcquired = await createLockDirectory();
  if (!isAcquired) {
    const observation = await observeManagedLock(target);
    if (observation === undefined || !observation.isStale) return undefined;
    if (!(await reclaimManagedLock(target, observation))) return undefined;
    isAcquired = await createLockDirectory();
    if (!isAcquired) return undefined;
  }
  const token = randomUUID();
  const ownerPath = path.join(target, `${token}.owner.json`);
  try {
    await writeFile(
      ownerPath,
      `${JSON.stringify({ token, pid: process.pid, createdAt: Date.now() })}\n`,
      { encoding: "utf8", flag: "wx" },
    );
    const owners = await readdir(target);
    if (owners.length !== 1 || owners[0] !== `${token}.owner.json`) {
      // A delayed incomplete creator may resume in a replacement directory. Only its sole
      // token can establish acquisition; remove our token without touching the other owner.
      await unlinkIfExists(ownerPath);
      return undefined;
    }
  } catch (error: unknown) {
    await unlink(ownerPath).catch(ignoreError);
    await rmdir(target).catch(ignoreError);
    throw error;
  }
  return async () => {
    if (!(await unlinkIfExists(ownerPath))) return;
    let didRemoveLock = false;
    try {
      await rmdir(target);
      didRemoveLock = true;
    } catch (error: unknown) {
      if (
        !isFileNotFound(error) &&
        !(error instanceof Error && "code" in error && error.code === "ENOTEMPTY") &&
        !(error instanceof Error && "code" in error && error.code === "EEXIST")
      ) {
        throw error;
      }
    }
    if (didRemoveLock) await removeEmptyManagedWriteLockGroup(root, target);
  };
}

/** Runs one operation after bounded lock acquisition and always releases the acquired token. */
export async function withManagedLock<T>(
  root: string,
  relativePath: string,
  options: ManagedLockRetryOptions,
  operation: () => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < options.maximumAttempts; attempt += 1) {
    const release = await tryAcquireManagedLock(root, relativePath);
    if (release === undefined) {
      await delay(options.retryMilliseconds);
      continue;
    }
    try {
      return await operation();
    } finally {
      await release();
    }
  }
  throw new Error(options.busyMessage);
}
