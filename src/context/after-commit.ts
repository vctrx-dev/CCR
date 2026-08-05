import { isSharedContext, readGitValue, readLastCommitPaths } from "./git";
import { createJournalEntry, journalEntryExistsForCommit } from "./journal";

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
  const changed = readLastCommitPaths(root);
  const repositoryChanges = changed.filter((relativePath) => !relativePath.startsWith(".ccr/"));
  const contextTouched = changed.some(isSharedContext);
  const journalCreated = !(await journalEntryExistsForCommit(root, commit));
  const journalPath = journalCreated
    ? (await createJournalEntry(root, new Date(), repositoryChanges)).path
    : undefined;
  const shouldWarn = repositoryChanges.length > 0 && !contextTouched;
  return {
    commit,
    journalCreated,
    journalPath,
    shouldWarn,
    prompt: shouldWarn || journalCreated ? AFTER_COMMIT_PROMPT : undefined,
  };
}
