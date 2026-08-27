import { createHash } from "node:crypto";
import { withManagedLock } from "./files";

/**
 * Journal-specific lock policy. The global mutation barrier must always be acquired before an
 * identity lock; extend these adapters instead of introducing feature-local lock ordering.
 */

const MAX_JOURNAL_LOCK_ATTEMPTS = 50;
const MAX_JOURNAL_MUTATION_LOCK_ATTEMPTS = 600;

/** Global barrier shared by journal mutations and uninstall's local-continuity decision. */
export const JOURNAL_MUTATION_LOCK_PATH = ".ccr/private/journal-mutation.lock";

/** Serializes journal work that targets one logical work, commit, or pull-request identity. */
export async function withJournalIdentityLock<T>(
  root: string,
  identity: string,
  operation: () => Promise<T>,
): Promise<T> {
  const lockName = createHash("sha256").update(identity).digest("hex");
  return withManagedLock(
    root,
    `.ccr/private/journal-locks/${lockName}.lock`,
    {
      busyMessage: "CCR journal remained busy; retry the operation.",
      maximumAttempts: MAX_JOURNAL_LOCK_ATTEMPTS,
      retryMilliseconds: 5,
    },
    operation,
  );
}

/**
 * Serializes journal creation and updates with uninstall's local-state recheck. Callers that also
 * need an identity lock must acquire this barrier first so lock order remains global then local.
 */
export async function withJournalMutationLock<T>(
  root: string,
  operation: () => Promise<T>,
): Promise<T> {
  return withManagedLock(
    root,
    JOURNAL_MUTATION_LOCK_PATH,
    {
      busyMessage: "CCR journal mutations remained busy; retry the operation.",
      maximumAttempts: MAX_JOURNAL_MUTATION_LOCK_ATTEMPTS,
      retryMilliseconds: 50,
    },
    operation,
  );
}
