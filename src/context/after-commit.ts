import { reconcileCommittedReviewState } from "../review/review-state";
import type { ReviewFreshnessStatus } from "../review/review-state";
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
  journalEntryForCommitParent,
  readCompleteJournalEntry,
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
  reviewStatus: ReviewFreshnessStatus;
  shouldWarn: boolean;
}

/**
 * Copy-paste instruction the post-commit hook emits for Claude Code. The installed ccr-context skill
 * owns every update, ownership, writing, and committed-assessment rule, so the hook names the
 * operation instead of keeping a second copy of that guidance that could drift from the skill.
 */
export const AFTER_COMMIT_PROMPT = "/ccr-context update last commit";

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
      reviewStatus: "unrecorded",
      shouldWarn: false,
    };
  }
  const changed = readChangedPaths(root, 1);
  const { hasRepositoryChanges, shouldWarn } = classifyContextChanges(changed);

  let journalCreated = false;
  let journalPath: string | undefined;
  let reviewJournalPath: string | undefined;
  try {
    const { branch, directory } = branchDetails(root);
    const details: JournalDetails = { branch, directory, commit };
    reviewJournalPath = (await journalEntryForCommitParent(root, details))?.path;
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

  let reviewStatus: ReviewFreshnessStatus = "unrecorded";
  const freshnessJournalPath = reviewJournalPath ?? journalPath;
  if (freshnessJournalPath !== undefined) {
    try {
      reviewStatus = await reconcileCommittedReviewState(root, freshnessJournalPath, commit);
    } catch {
      // Review freshness is advisory and must never break the post-commit hook.
    }
  }

  let journalNeedsCompletion = journalPath === undefined;
  if (journalPath !== undefined) {
    try {
      journalNeedsCompletion = (await readCompleteJournalEntry(root, journalPath)).includes(
        "Needs concise completion.",
      );
    } catch {
      journalNeedsCompletion = true;
    }
  }

  return {
    commit,
    hasRepositoryChanges,
    journalCreated,
    journalPath,
    reviewStatus,
    shouldWarn,
    prompt:
      hasRepositoryChanges && (shouldWarn || journalNeedsCompletion)
        ? AFTER_COMMIT_PROMPT
        : undefined,
  };
}
