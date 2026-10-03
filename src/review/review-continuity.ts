import { z } from "zod";
import { writeManagedTextIfUnchanged } from "../context/files";
import { readCompleteJournalEntry, readReviewJournalEntry } from "../context/journal";
import {
  JOURNAL_COMPLETION_PLACEHOLDER,
  assertJournalContentWithinLimit,
  isValidJournalTimestamp,
  parseJournalPath,
  refreshJournalActivity,
} from "../context/journal-document";
import { hasSafeReviewChanges, listSafeReviewChanges } from "./evidence";
import { isReviewSnapshotCovered, recordReviewCoverage } from "./review-coverage";
import {
  computeCommittedReviewSnapshot,
  computeStagedReviewSnapshot,
  computeWorkingReviewSnapshot,
  computeWorkingReviewState,
} from "./review-fingerprint";

/**
 * Review continuity persisted in journals. Parsing and CAS writes stay separate from fingerprint
 * construction so metadata can never broaden the evidence that a review state represents.
 */

const reviewFingerprintSchema = z
  .string()
  .regex(/^sha256:[0-9a-f]{64}$/u, "Review fingerprint is malformed.");
const REVIEW_RUN_HEADING_PATTERN = /^## Review run — ([^\r\n]+)$/gmu;
const REVIEW_SCOPE_PATTERN = /^- \*\*Scope\*\*: (changes|codebase)$/gmu;
const REVIEW_DIMENSIONS_PATTERN = /^- \*\*Dimensions\*\*: (\S.*)$/gmu;
const REVIEW_EVIDENCE_PATTERN = /^- \*\*Evidence\*\*: (\S.*)$/gmu;
const REVIEW_FINDING_COUNTS_PATTERN =
  /^- \*\*Finding counts\*\*: critical=\d+, high=\d+, medium=\d+, low=\d+$/gmu;
const REVIEW_OUTCOMES_PATTERN = /^- \*\*Outcomes\*\*: (\S.*)$/gmu;
const REVIEWED_STATE_PATTERN = /^- \*\*Reviewed state\*\*: `([^`]+)`$/gmu;
const REVIEWED_CONTEXT_PATTERN = /^- \*\*Reviewed context\*\*: `([^`]+)`$/gmu;
const REVIEW_STATUS_PATTERN = /^- \*\*Review status\*\*: (current|stale)$/gmu;

export type ReviewFreshnessStatus = "current" | "stale" | "unrecorded";

export interface ReviewFreshness {
  status: ReviewFreshnessStatus;
  journalPath?: string;
}

interface ReviewRecord {
  fingerprint: string;
  contextFingerprint: string;
  status: "current" | "stale";
}

interface ReviewSection {
  start: number;
  end: number;
  timestamp: string;
}

function latestReviewSection(content: string): ReviewSection | undefined {
  const match = [...content.matchAll(REVIEW_RUN_HEADING_PATTERN)].at(-1);
  if (match === undefined || match.index === undefined) return undefined;
  const timestamp = match[1];
  if (timestamp === undefined) return undefined;
  const start = content.indexOf("\n", match.index);
  if (start < 0) return { start: content.length, end: content.length, timestamp };
  const nextHeading = content.indexOf("\n## ", start + 1);
  return {
    start: start + 1,
    end: nextHeading < 0 ? content.length : nextHeading + 1,
    timestamp,
  };
}

async function readJournal(root: string, journalPath: string): Promise<string> {
  return readCompleteJournalEntry(root, parseJournalPath(journalPath));
}

function parseReviewRecord(body: string): ReviewRecord | undefined {
  const fingerprintMatches = [...body.matchAll(REVIEWED_STATE_PATTERN)];
  const contextMatches = [...body.matchAll(REVIEWED_CONTEXT_PATTERN)];
  const statusMatches = [...body.matchAll(REVIEW_STATUS_PATTERN)];
  if (
    fingerprintMatches.length !== 1 ||
    contextMatches.length !== 1 ||
    statusMatches.length !== 1
  ) {
    return undefined;
  }
  const fingerprint = fingerprintMatches[0]?.[1];
  const contextFingerprint = contextMatches[0]?.[1];
  const status = statusMatches[0]?.[1];
  const parsed = reviewFingerprintSchema.safeParse(fingerprint);
  const parsedContext = reviewFingerprintSchema.safeParse(contextFingerprint);
  if (!parsed.success || !parsedContext.success || (status !== "current" && status !== "stale")) {
    return undefined;
  }
  return { fingerprint: parsed.data, contextFingerprint: parsedContext.data, status };
}

function hasExactlyOneMatch(content: string, pattern: RegExp): boolean {
  return [...content.matchAll(pattern)].length === 1;
}

function hasCompleteReviewContinuity(content: string, section: ReviewSection): boolean {
  const body = content.slice(section.start, section.end);
  return (
    !content.includes(JOURNAL_COMPLETION_PLACEHOLDER) &&
    isValidJournalTimestamp(section.timestamp) &&
    hasExactlyOneMatch(body, REVIEW_SCOPE_PATTERN) &&
    hasExactlyOneMatch(body, REVIEW_DIMENSIONS_PATTERN) &&
    hasExactlyOneMatch(body, REVIEW_EVIDENCE_PATTERN) &&
    hasExactlyOneMatch(body, REVIEW_FINDING_COUNTS_PATTERN) &&
    hasExactlyOneMatch(body, REVIEW_OUTCOMES_PATTERN)
  );
}

function readReviewRecord(content: string): ReviewRecord | undefined {
  const section = latestReviewSection(content);
  if (section === undefined || !hasCompleteReviewContinuity(content, section)) return undefined;
  return parseReviewRecord(content.slice(section.start, section.end));
}

function assertCompleteReviewContinuity(content: string, section: ReviewSection): void {
  if (content.includes(JOURNAL_COMPLETION_PLACEHOLDER)) {
    throw new Error("Journal still contains the review completion placeholder.");
  }
  if (!isValidJournalTimestamp(section.timestamp)) {
    throw new Error("Journal review-run timestamp is malformed.");
  }
  if (!hasCompleteReviewContinuity(content, section)) {
    throw new Error("Journal review continuity is incomplete.");
  }
  const body = content.slice(section.start, section.end);
  const recordCounts = [
    [...body.matchAll(REVIEWED_STATE_PATTERN)].length,
    [...body.matchAll(REVIEWED_CONTEXT_PATTERN)].length,
    [...body.matchAll(REVIEW_STATUS_PATTERN)].length,
  ];
  if (!recordCounts.every((count) => count === 0) && !recordCounts.every((count) => count === 1)) {
    throw new Error("Journal review record metadata is malformed.");
  }
  if (recordCounts.every((count) => count === 1) && parseReviewRecord(body) === undefined) {
    throw new Error("Journal review record metadata is malformed.");
  }
}

async function assertCurrentReviewJournal(root: string, journalPath: string): Promise<void> {
  const changes = await listSafeReviewChanges(root);
  const selected = await readReviewJournalEntry(root, {
    kind: hasSafeReviewChanges(changes) ? "working" : "head",
  });
  if (selected?.path !== journalPath) {
    throw new Error("Journal is not the current review journal for this branch and state.");
  }
}

async function writeJournalIfUnchanged(
  root: string,
  journalPath: string,
  expectedContent: string,
  content: string,
): Promise<void> {
  assertJournalContentWithinLimit(content, journalPath);
  const didWrite = await writeManagedTextIfUnchanged(root, journalPath, expectedContent, content);
  if (!didWrite) {
    throw new Error(`Journal changed concurrently; reload it before writing: ${journalPath}`);
  }
}

/** Records verified code and context fingerprints only in the current branch journal. */
export async function recordWorkingReviewState(
  root: string,
  journalPath: string,
  expectedFingerprint: string,
  expectedContextFingerprint: string,
): Promise<void> {
  await recordReviewState(root, journalPath, {
    fingerprint: expectedFingerprint,
    contextFingerprint: expectedContextFingerprint,
  });
}

/** Explicitly continues a recorded HEAD review into context-only working state, not a new review. */
export async function continueWorkingReviewState(
  root: string,
  journalPath: string,
  sourceJournalPath: string,
  expected: { fingerprint: string; contextFingerprint: string },
): Promise<void> {
  await recordReviewState(root, journalPath, expected, parseJournalPath(sourceJournalPath));
}

async function assertCurrentHeadJournal(root: string, sourcePath: string): Promise<void> {
  const source = await readReviewJournalEntry(root, { kind: "head" });
  if (source?.path !== sourcePath) {
    throw new Error("Continuation source is not the current HEAD journal for this branch.");
  }
}

async function recordReviewState(
  root: string,
  journalPath: string,
  expectedState: { fingerprint: string; contextFingerprint: string },
  sourcePath?: string,
): Promise<void> {
  const expected = reviewFingerprintSchema.parse(expectedState.fingerprint);
  const expectedContext = reviewFingerprintSchema.parse(expectedState.contextFingerprint);
  const normalizedJournalPath = parseJournalPath(journalPath);
  await assertCurrentReviewJournal(root, normalizedJournalPath);
  const current = await computeWorkingReviewState(root);
  if (current.fingerprint !== expected) {
    throw new Error("Review evidence changed before continuity completed; rerun the review.");
  }
  if (current.contextFingerprint !== expectedContext) {
    throw new Error("Review context changed before continuity completed; reload the context.");
  }
  const content = await readJournal(root, normalizedJournalPath);
  let reviewContent = content;
  let sourceContent: string | undefined;
  if (sourcePath !== undefined) {
    await assertCurrentHeadJournal(root, sourcePath);
    const working = await readReviewJournalEntry(root, { kind: "working" });
    if (working?.path !== normalizedJournalPath || sourcePath === normalizedJournalPath) {
      throw new Error("A HEAD review can only continue into the current working journal.");
    }
    if (latestReviewSection(content) !== undefined) {
      throw new Error(
        "Continuation target already contains a review run; re-record that run instead.",
      );
    }
    sourceContent = await readJournal(root, sourcePath);
    const sourceSection = latestReviewSection(sourceContent);
    if (sourceSection === undefined)
      throw new Error("Continuation source does not contain a review run.");
    assertCompleteReviewContinuity(sourceContent, sourceSection);
    const sourceRecord = readReviewRecord(sourceContent);
    if (sourceRecord === undefined)
      throw new Error("Continuation source has no recorded review state.");
    if (sourceRecord.fingerprint !== expected) {
      throw new Error("Code changed since this review was recorded; run the review again.");
    }
    // Preserve the original timestamp, scope, counts and outcomes; the source receipt stays untouched.
    const run = `## Review run — ${sourceSection.timestamp}\n${sourceContent.slice(sourceSection.start, sourceSection.end)}`;
    reviewContent = `${content.replace(JOURNAL_COMPLETION_PLACEHOLDER, "Continued the recorded HEAD review after a verified context clarification.").trimEnd()}\n\n${run.trimEnd()}\n- **Continued from**: ${sourcePath}\n`;
    reviewContent = refreshJournalActivity(reviewContent, new Date(), normalizedJournalPath);
  }
  const section = latestReviewSection(reviewContent);
  if (section === undefined) throw new Error("Journal does not contain a review run.");
  assertCompleteReviewContinuity(reviewContent, section);
  // Re-recording may absorb this review's own context edits, never code it did not examine.
  const previous = parseReviewRecord(reviewContent.slice(section.start, section.end));
  if (previous !== undefined && previous.fingerprint !== expected) {
    throw new Error("Code changed since this review was recorded; run the review again.");
  }
  const body = reviewContent
    .slice(section.start, section.end)
    .replace(/^- \*\*Reviewed state\*\*: `[^`]+`\r?\n?/gmu, "")
    .replace(/^- \*\*Reviewed context\*\*: `[^`]+`\r?\n?/gmu, "")
    .replace(/^- \*\*Review status\*\*: (?:current|stale)\r?\n?/gmu, "");
  const metadata = `\n- **Reviewed state**: \`${expected}\`\n- **Reviewed context**: \`${expectedContext}\`\n- **Review status**: current\n`;
  const updated = `${reviewContent.slice(0, section.start)}${metadata}${body}${reviewContent.slice(section.end)}`;
  const verifiedSnapshot = await computeWorkingReviewSnapshot(root);
  const verified = verifiedSnapshot.state;
  if (verified.fingerprint !== expected) {
    throw new Error("Review evidence changed before continuity completed; rerun the review.");
  }
  if (verified.contextFingerprint !== expectedContext) {
    throw new Error("Review context changed before continuity completed; reload the context.");
  }
  await assertCurrentReviewJournal(root, normalizedJournalPath);
  if (sourcePath !== undefined) {
    await assertCurrentHeadJournal(root, sourcePath);
    if ((await readJournal(root, sourcePath)) !== sourceContent) {
      throw new Error("Continuation source changed concurrently; reload it before recording.");
    }
  }
  await writeJournalIfUnchanged(root, normalizedJournalPath, content, updated);
  await recordReviewCoverage(root, "review", verifiedSnapshot);
}

/**
 * Compares the staged commit candidate with the latest review recorded for this working journal.
 * Committing only reviewed, unchanged files stays current even when other reviewed work remains.
 * An earlier commit's review does not cover new work, so it is not compared; that would only
 * repeat the same reminder on every later commit.
 */
export async function readStagedReviewFreshness(root: string): Promise<ReviewFreshness> {
  const changes = await listSafeReviewChanges(root);
  const journal = await readReviewJournalEntry(root, {
    kind: hasSafeReviewChanges(changes) ? "working" : "head",
  });
  if (journal === undefined) return { status: "unrecorded" };
  const record = readReviewRecord(await readJournal(root, journal.path));
  if (record === undefined) return { status: "unrecorded", journalPath: journal.path };
  const staged = await computeStagedReviewSnapshot(root);
  return {
    status: (await isReviewSnapshotCovered(root, "review", record, staged)) ? "current" : "stale",
    journalPath: journal.path,
  };
}

/** Compares a finalized commit with its journal review and marks a mismatch stale. */
export async function reconcileCommittedReviewState(
  root: string,
  journalPath: string,
  commit: string,
): Promise<ReviewFreshnessStatus> {
  const content = await readJournal(root, journalPath);
  const record = readReviewRecord(content);
  if (record === undefined) return "unrecorded";
  const committed = await computeCommittedReviewSnapshot(root, commit);
  if (await isReviewSnapshotCovered(root, "review", record, committed)) return "current";
  const section = latestReviewSection(content);
  if (section === undefined) return "unrecorded";
  const before = content.slice(0, section.start);
  const body = content
    .slice(section.start, section.end)
    .replace(/^- \*\*Review status\*\*: (?:current|stale)$/mu, "- **Review status**: stale");
  await writeJournalIfUnchanged(
    root,
    journalPath,
    content,
    `${before}${body}${content.slice(section.end)}`,
  );
  return "stale";
}
