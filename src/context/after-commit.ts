import { classifyContextChanges, readChangedPaths, readGitValue } from "./git";
import { branchDetails, createJournalEntry, journalEntryExistsForCommit } from "./journal";
import type { JournalDetails } from "./journal";

/**
 * Post-commit advisory check: keeps shared context and branch-local continuity journals current
 * without blocking commits. Reuses the index-only Git boundaries; the semantic decision of whether
 * `.ccr/project.md` actually needs editing is left to Claude Code via the emitted prompt.
 */

export interface AfterCommitResult {
  commit: string;
  journalCreated: boolean;
  journalPath?: string;
  prompt?: string;
  shouldWarn: boolean;
}

/** Copy-paste instruction the post-commit hook emits for a developer to run in Claude Code. */
export const AFTER_COMMIT_PROMPT =
  "Use the ccr-context skill to update the context and complete the journal entry based on the last commit of this branch, changing .ccr/project.md only if that commit affects the project's high-level context.";

/** Ensures a journal entry exists for the current commit and reports whether shared context is stale. */
export async function runAfterCommitCheck(root: string): Promise<AfterCommitResult> {
  let commit: string;
  try {
    commit = readGitValue(root, ["rev-parse", "HEAD"]);
  } catch {
    return { commit: "", journalCreated: false, journalPath: undefined, shouldWarn: false };
  }
  const changed = readChangedPaths(root, 1);
  const { hasRepositoryChanges, shouldWarn } = classifyContextChanges(changed);

  let journalCreated = false;
  let journalPath: string | undefined;
  try {
    const { branch, directory } = branchDetails(root);
    const details: JournalDetails = { branch, directory, commit };
    if (!(await journalEntryExistsForCommit(root, commit, directory))) {
      const created = await createJournalEntry(root, new Date(), changed, details);
      journalPath = created.path;
      journalCreated = true;
    }
  } catch {
    // Journaling must never break the advisory hook; the context warning still applies.
  }

  return {
    commit,
    journalCreated,
    journalPath,
    shouldWarn,
    prompt:
      shouldWarn || (journalCreated && hasRepositoryChanges) ? AFTER_COMMIT_PROMPT : undefined,
  };
}
