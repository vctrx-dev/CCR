import { createHash, randomUUID } from "node:crypto";
import type { Dirent, Stats } from "node:fs";
import { lstat, mkdir, readdir, rename, rm, rmdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { isFileNotFound, readBoundedTextIfExists } from "./bounded-text";
import { assertSafeManagedPath } from "./managed-path";

/**
 * Token-owned repository lock boundary. Callers may attempt immediate acquisition or use the
 * bounded retry wrapper; stale reclamation remains identity-checked inside this module.
 */

const INCOMPLETE_LOCK_GRACE_MS = 5_000;
const MAX_MANAGED_LOCK_AGE_MS = 15 * 60_000;
const LOCK_OWNER_FILE_PATTERN = /^([a-f0-9-]{36})\.owner\.json$/u;
const STALE_LOCK_MARKER = "stale lock quarantine\n";

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

async function unlinkIfExists(target: string): Promise<void> {
  try {
    await unlink(target);
  } catch (error: unknown) {
    if (!isFileNotFound(error)) throw error;
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

async function isObservedManagedLockStale(target: string, details: Stats): Promise<boolean> {
  if (details.isFile()) {
    const existing = await readBoundedTextIfExists(target, 300).catch(() => undefined);
    const owner = existing?.isTruncated
      ? undefined
      : parseManagedLockOwner(existing?.content ?? "", "legacy-lock-owner");
    return owner === undefined
      ? Date.now() - details.mtimeMs > INCOMPLETE_LOCK_GRACE_MS
      : !isProcessAlive(owner.pid) || Date.now() - owner.createdAt > MAX_MANAGED_LOCK_AGE_MS;
  }
  if (!details.isDirectory()) return false;
  let entries: Dirent[];
  try {
    entries = await readdir(target, { withFileTypes: true });
  } catch (error: unknown) {
    if (isFileNotFound(error)) return true;
    if (isTransientLockObservationError(error)) return false;
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
          return (
            !isProcessAlive(owner.pid) || Date.now() - owner.createdAt > MAX_MANAGED_LOCK_AGE_MS
          );
        }
      }
    }
  }
  return Date.now() - details.mtimeMs > INCOMPLETE_LOCK_GRACE_MS;
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
  const isStale = await isObservedManagedLockStale(target, details);
  try {
    if (managedLockIdentity(target, await lstat(target)) !== identity) return undefined;
  } catch (error: unknown) {
    if (isFileNotFound(error)) return undefined;
    throw error;
  }
  return { identity, isStale };
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await lstat(target);
    return true;
  } catch (error: unknown) {
    if (isFileNotFound(error)) return false;
    throw error;
  }
}

async function reclaimManagedLock(
  target: string,
  observation: ManagedLockObservation,
): Promise<string | undefined> {
  const quarantine = `${target}.ccr-stale-${observation.identity}`;
  try {
    await rename(target, quarantine);
  } catch (error: unknown) {
    if (isFileNotFound(error)) return undefined;
    if (await pathExists(quarantine)) return undefined;
    if (
      error instanceof Error &&
      "code" in error &&
      ["EACCES", "EEXIST", "EISDIR", "ENOTDIR", "ENOTEMPTY", "EPERM"].includes(String(error.code))
    ) {
      return undefined;
    }
    throw error;
  }
  if ((await lstat(quarantine)).isDirectory()) {
    await writeFile(path.join(quarantine, ".ccr-stale-lock"), STALE_LOCK_MARKER, "utf8");
  }
  return quarantine;
}

/**
 * Atomically acquires a repository-contained, token-owned local lock. An absent result means a
 * live owner or a recently created incomplete owner holds it. Release cannot remove a replacement
 * owner's lock, and dead or old incomplete locks are reclaimed through an atomic rename.
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
  let quarantine: string | undefined;
  if (!isAcquired) {
    const observation = await observeManagedLock(target);
    if (observation === undefined || !observation.isStale) return undefined;
    quarantine = await reclaimManagedLock(target, observation);
    if (quarantine === undefined) return undefined;
    isAcquired = await createLockDirectory();
    if (!isAcquired) return undefined;
  }
  const token = randomUUID();
  const ownerPath = path.join(target, `${token}.owner.json`);
  try {
    await writeFile(
      ownerPath,
      `${JSON.stringify({ token, pid: process.pid, createdAt: Date.now() })}\n`,
      "utf8",
    );
  } catch (error: unknown) {
    await unlink(ownerPath).catch(ignoreError);
    const didRemoveLock = await rmdir(target)
      .then(() => true)
      .catch(() => false);
    if (didRemoveLock && quarantine !== undefined) {
      await rm(quarantine, { recursive: true, force: true }).catch(ignoreError);
    }
    throw error;
  }
  return async () => {
    await unlinkIfExists(ownerPath);
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
    if (didRemoveLock && quarantine !== undefined) {
      await rm(quarantine, { recursive: true, force: true });
    }
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
