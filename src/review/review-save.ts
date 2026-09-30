import { z } from "zod";
import { writeManagedTextIfUnchanged } from "../context/files";
import {
  ensureJournalEntryForHead,
  ensurePullRequestJournalEntry,
  ensureWorkingJournalEntry,
  parsePullRequestToken,
  readCompleteJournalEntry,
} from "../context/journal";
import {
  JOURNAL_COMPLETION_PLACEHOLDER,
  assertJournalContentWithinLimit,
  refreshJournalActivity,
} from "../context/journal-document";
import { hasSafeReviewChanges, listSafeReviewChanges } from "./evidence";
import { recordWorkingReviewState } from "./review-continuity";
import { computeWorkingReviewState } from "./review-fingerprint";

/**
 * One-step review continuity for the review skill: selects the journal, appends a complete review
 * run, and records fingerprints for changes and codebase scopes. Reuse the journal and continuity
 * boundaries here instead of teaching prompts the journal format.
 */

const MAX_SUMMARY_CHARACTERS = 500;
const reviewFingerprintSchema = z
  .string()
  .regex(/^sha256:[0-9a-f]{64}$/u, "Review fingerprint is malformed.");

const saveReviewInputSchema = z
  .object({
    scope: z.union([z.enum(["changes", "codebase"]), z.string().regex(/^PR-[1-9][0-9]*$/iu)]),
    dimensions: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*(?:,[a-z0-9]+(?:-[a-z0-9]+)*)*$/u),
    counts: z
      .string()
      .regex(/^\d{1,4},\d{1,4},\d{1,4},\d{1,4}$/u, "Counts must be critical,high,medium,low."),
    summary: z
      .string()
      .trim()
      .min(1)
      .max(MAX_SUMMARY_CHARACTERS)
      .regex(/^[^\r\n]+$/u, "Summary must be one line."),
    expectedState: reviewFingerprintSchema.optional(),
    expectedContext: reviewFingerprintSchema.optional(),
  })
  .strict()
  .refine(
    ({ expectedState, expectedContext }) =>
      (expectedState === undefined) === (expectedContext === undefined),
    "Pass the expected review state and context fingerprints together.",
  );

export interface SaveReviewResult {
  path: string;
  isRecorded: boolean;
}

function journalTimestamp(now: Date): string {
  return now.toISOString().replace(/\.\d{3}Z$/u, "Z");
}

/**
 * Saves one completed review run. With `expectedState` and `expectedContext` from the reviewer's
 * pre-discovery `review-state`, changes and codebase runs record exactly those fingerprints and
 * refuse edits made during the review; without them the current state is recorded for backward
 * compatibility. PR runs are journaled without local fingerprints.
 *
 * @param input - Untrusted CLI values: scope, dimension IDs, `critical,high,medium,low`, summary,
 * and optional expected fingerprints.
 */
export async function saveReview(
  root: string,
  input: unknown,
  now: Date = new Date(),
): Promise<SaveReviewResult> {
  const { scope, dimensions, counts, summary, expectedState, expectedContext } =
    saveReviewInputSchema.parse(input);
  const isPullRequest = scope !== "changes" && scope !== "codebase";
  if (isPullRequest && expectedState !== undefined) {
    throw new Error("Expected review fingerprints apply only to changes and codebase scopes.");
  }
  if (expectedState !== undefined) {
    const current = await computeWorkingReviewState(root);
    if (current.fingerprint !== expectedState) {
      throw new Error(
        "Review evidence changed since review-state was captured; review the changes or report the review as stale.",
      );
    }
    if (current.contextFingerprint !== expectedContext) {
      throw new Error(
        "Review context changed since review-state was captured; reload the context before saving.",
      );
    }
  }
  const changes = isPullRequest ? undefined : await listSafeReviewChanges(root);
  const journal = isPullRequest
    ? await ensurePullRequestJournalEntry(root, parsePullRequestToken(scope))
    : changes !== undefined && hasSafeReviewChanges(changes)
      ? await ensureWorkingJournalEntry(root, now)
      : await ensureJournalEntryForHead(root, now);

  const [critical, high, medium, low] = counts.split(",").map(Number);
  const evidence =
    changes === undefined
      ? `pull request ${scope.toUpperCase()}`
      : `${changes.stagedPaths.length + changes.unstagedPaths.length + changes.untrackedPaths.length} changed paths${scope === "codebase" ? " plus the whole codebase" : ""}`;
  const run = [
    `## Review run — ${journalTimestamp(now)}`,
    "",
    `- **Scope**: ${isPullRequest ? scope.toUpperCase() : scope}`,
    `- **Dimensions**: ${dimensions}`,
    `- **Evidence**: ${evidence}`,
    `- **Finding counts**: critical=${critical}, high=${high}, medium=${medium}, low=${low}`,
    `- **Outcomes**: ${summary}`,
    "",
  ].join("\n");

  const existing = await readCompleteJournalEntry(root, journal.path);
  const withSummary = existing.replace(JOURNAL_COMPLETION_PLACEHOLDER, summary);
  const refreshed = refreshJournalActivity(withSummary, now, journal.path);
  const updated = `${refreshed.replace(/\s*$/u, "\n")}\n${run}`;
  assertJournalContentWithinLimit(updated, journal.path);
  if (!(await writeManagedTextIfUnchanged(root, journal.path, existing, updated))) {
    throw new Error(`Journal changed concurrently; retry saving the review: ${journal.path}`);
  }
  if (isPullRequest) return { path: journal.path, isRecorded: false };

  const state =
    expectedState !== undefined && expectedContext !== undefined
      ? { fingerprint: expectedState, contextFingerprint: expectedContext }
      : await computeWorkingReviewState(root);
  await recordWorkingReviewState(root, journal.path, state.fingerprint, state.contextFingerprint);
  return { path: journal.path, isRecorded: true };
}
