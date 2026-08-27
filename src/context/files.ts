/**
 * Stable managed-files façade. Implementation is divided by responsibility so path safety, lock
 * ownership, bounded reads, and compare-and-swap writes can evolve independently without changing
 * existing callers or the supported package surface.
 */

export {
  type BoundedText,
  type BoundedUtf8Text,
  isFileNotFound,
  readBoundedTextIfExists,
  readBoundedUtf8TextIfExists,
  readTextIfExists,
} from "./bounded-text";
export {
  assertSafeManagedPath,
  createManagedTextExclusive,
  fingerprintManagedTree,
  readManagedTextIfExists,
  readRegularFileGitMode,
  writeManagedText,
  writeTextAtomic,
} from "./managed-path";
export {
  MANAGED_LIFECYCLE_LOCK_PATH,
  type ManagedLockRetryOptions,
  tryAcquireManagedLock,
  withManagedLock,
} from "./managed-lock";
export { deleteManagedTextIfUnchanged, writeManagedTextIfUnchanged } from "./managed-cas";
