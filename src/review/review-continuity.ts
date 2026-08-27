import { z } from "zod";
import { writeManagedTextIfUnchanged } from "../context/files";
import { readCompleteJournalEntry, readCurrentReviewJournalEntry } from "../context/journal";
import {
  JOURNAL_COMPLETION_PLACEHOLDER,
  assertJournalContentWithinLimit,
  isValidJournalTimestamp,
  parseJournalPath,
} from "../context/journal-document";
import {
  computeCommittedReviewState,
  computeStagedReviewState,
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
  const selected = await readCurrentReviewJournalEntry(root);
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
  const expected = reviewFingerprintSchema.parse(expectedFingerprint);
  const expectedContext = reviewFingerprintSchema.parse(expectedContextFingerprint);
  const current = await computeWorkingReviewState(root);
  if (current.fingerprint !== expected) {
    throw new Error("Review evidence changed before continuity completed; rerun the review.");
  }
  if (current.contextFingerprint !== expectedContext) {
    throw new Error("Review context changed before continuity completed; reload the context.");
  }
  const normalizedJournalPath = parseJournalPath(journalPath);
  await assertCurrentReviewJournal(root, normalizedJournalPath);
  const content = await readJournal(root, normalizedJournalPath);
  const section = latestReviewSection(content);
  if (section === undefined) throw new Error("Journal does not contain a review run.");
  assertCompleteReviewContinuity(content, section);
  const body = content
    .slice(section.start, section.end)
    .replace(/^- \*\*Reviewed state\*\*: `[^`]+`\r?\n?/gmu, "")
    .replace(/^- \*\*Reviewed context\*\*: `[^`]+`\r?\n?/gmu, "")
    .replace(/^- \*\*Review status\*\*: (?:current|stale)\r?\n?/gmu, "");
  const metadata = `\n- **Reviewed state**: \`${expected}\`\n- **Reviewed context**: \`${expectedContext}\`\n- **Review status**: current\n`;
  const updated = `${content.slice(0, section.start)}${metadata}${body}${content.slice(section.end)}`;
  const verified = await computeWorkingReviewState(root);
  if (verified.fingerprint !== expected) {
    throw new Error("Review evidence changed before continuity completed; rerun the review.");
  }
  if (verified.contextFingerprint !== expectedContext) {
    throw new Error("Review context changed before continuity completed; reload the context.");
  }
  await assertCurrentReviewJournal(root, normalizedJournalPath);
  await writeJournalIfUnchanged(root, normalizedJournalPath, content, updated);
}

/** Compares the staged commit candidate with the latest review recorded for this working journal. */
export async function readStagedReviewFreshness(root: string): Promise<ReviewFreshness> {
  const journal = await readCurrentReviewJournalEntry(root);
  if (journal === undefined) return { status: "unrecorded" };
  const record = readReviewRecord(await readJournal(root, journal.path));
  if (record === undefined) return { status: "unrecorded", journalPath: journal.path };
  const staged = await computeStagedReviewState(root);
  return {
    status:
      record.fingerprint === staged.fingerprint &&
      record.contextFingerprint === staged.contextFingerprint
        ? "current"
        : "stale",
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
  const committed = await computeCommittedReviewState(root, commit);
  if (
    record.fingerprint === committed.fingerprint &&
    record.contextFingerprint === committed.contextFingerprint
  ) {
    return "current";
  }
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
