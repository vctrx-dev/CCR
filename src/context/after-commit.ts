import {
  classifyContextChanges,
  hasWorkingTreeChanges,
  readChangedPaths,
  readGitValue,
} from "./git";
import {
  branchDetails,
  createJournalEntry,
  finalizeWorkingJournalEntry,
  journalEntryForCommit,
} from "./journal";
import type { JournalDetails } from "./journal";

/**
 * Post-commit advisory check: keeps shared context and branch-local continuity journals current
 * without blocking commits. Reuses the index-only Git boundaries; the semantic decision of whether
 * `.ccr/project.md` actually needs editing is left to Claude Code via the emitted prompt.
 */

export interface AfterCommitResult {
  commit: string;
  hasRepositoryChanges: boolean;
  journalCreated: boolean;
  journalPath?: string;
  prompt?: string;
  shouldWarn: boolean;
}

/** Copy-paste instruction the post-commit hook emits for a developer to run in Claude Code. */
export const AFTER_COMMIT_PROMPT =
  "Use the ccr-context skill to update context for the last commit of this branch. Read project.md, stakeholders.md, decisions.md, and the configured recent journals first; complete the same journal entry for this commit; change .ccr/project.md only for durable high-level context, keep .ccr/stakeholders.md read-only, and append a rare decision only through the configured opt-in.";

/** Ensures a journal entry exists for the current commit and reports whether shared context is stale. */
export async function runAfterCommitCheck(root: string): Promise<AfterCommitResult> {
  let commit: string;
  try {
    commit = readGitValue(root, ["rev-parse", "HEAD"]);
  } catch {
    return {
      commit: "",
      hasRepositoryChanges: false,
      journalCreated: false,
      journalPath: undefined,
      shouldWarn: false,
    };
  }
  const changed = readChangedPaths(root, 1);
  const { hasRepositoryChanges, shouldWarn } = classifyContextChanges(changed);

  let journalCreated = false;
  let journalPath: string | undefined;
  try {
    const { branch, directory } = branchDetails(root);
    const details: JournalDetails = { branch, directory, commit };
    const existing = await journalEntryForCommit(root, commit, directory);
    if (existing) {
      journalPath = existing.path;
    } else {
      const working = hasWorkingTreeChanges(root)
        ? undefined
        : await finalizeWorkingJournalEntry(root, details);
      if (working) {
        journalPath = working.path;
      } else {
        const created = await createJournalEntry(root, new Date(), details);
        journalPath = created.path;
        journalCreated = true;
      }
    }
  } catch {
    // Journaling must never break the advisory hook; the context warning still applies.
  }

  return {
    commit,
    hasRepositoryChanges,
    journalCreated,
    journalPath,
    shouldWarn,
    prompt:
      shouldWarn || (journalCreated && hasRepositoryChanges) ? AFTER_COMMIT_PROMPT : undefined,
  };
}
