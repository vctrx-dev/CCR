import { z } from "zod";
import {
  assertSafeManagedPath,
  readBoundedUtf8TextIfExists,
  writeManagedText,
} from "../context/files";
import { branchDetails } from "../context/journal";
import type { ReviewSnapshot } from "./review-fingerprint";

/**
 * Private per-branch record of the exact path states behind the latest recorded review or context
 * assessment. It lets a commit made only of reviewed, unchanged files count as covered while other
 * reviewed or untracked work stays uncommitted. Path names stay in ignored private state, never in
 * shared context or journals. A missing or unreadable record falls back to exact fingerprint matching.
 */

const MAX_COVERAGE_ENTRIES = 5_000;
const MAX_COVERAGE_CHARACTERS = 2_000_000;
const fingerprintSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const coverageSchema = z
  .object({
    schemaVersion: z.literal(1),
    fingerprint: fingerprintSchema,
    baseCommit: z.string().min(1).max(64),
    entries: z
      .array(z.tuple([z.string().min(1).max(4_096), z.string().max(16), z.string().max(64)]))
      .max(MAX_COVERAGE_ENTRIES),
  })
  .strict();

export type ReviewCoverageKind = "assessment" | "review";

interface RecordedFingerprints {
  fingerprint: string;
  contextFingerprint: string;
}

function coveragePath(root: string, kind: ReviewCoverageKind): string {
  return `.ccr/private/coverage/${kind}-${branchDetails(root).directory}.json`;
}

/** Stores the entries behind a just-recorded fingerprint; oversized sets keep exact matching only. */
export async function recordReviewCoverage(
  root: string,
  kind: ReviewCoverageKind,
  snapshot: ReviewSnapshot,
): Promise<void> {
  if (snapshot.entries.length > MAX_COVERAGE_ENTRIES) return;
  await writeManagedText(
    root,
    coveragePath(root, kind),
    `${JSON.stringify({
      schemaVersion: 1,
      fingerprint: snapshot.state.fingerprint,
      baseCommit: snapshot.state.baseCommit,
      entries: snapshot.entries,
    })}\n`,
  );
}

async function readCoverage(root: string, kind: ReviewCoverageKind) {
  try {
    const text = await readBoundedUtf8TextIfExists(
      await assertSafeManagedPath(root, coveragePath(root, kind)),
      MAX_COVERAGE_CHARACTERS,
    );
    if (text === undefined || text.isTruncated || text.isBinary) return undefined;
    const parsed = coverageSchema.safeParse(JSON.parse(text.content));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Returns whether a candidate (staged or committed) is the recorded state or a subset of it with the
 * same base commit, identical path contents, and unchanged review context.
 */
export async function isReviewSnapshotCovered(
  root: string,
  kind: ReviewCoverageKind,
  recorded: RecordedFingerprints,
  candidate: ReviewSnapshot,
): Promise<boolean> {
  if (recorded.contextFingerprint !== candidate.state.contextFingerprint) return false;
  if (recorded.fingerprint === candidate.state.fingerprint) return true;
  if (candidate.entries.length === 0) return false;
  const coverage = await readCoverage(root, kind);
  if (
    coverage === undefined ||
    coverage.fingerprint !== recorded.fingerprint ||
    coverage.baseCommit !== candidate.state.baseCommit
  ) {
    return false;
  }
  const reviewed = new Map(coverage.entries.map(([path, mode, oid]) => [path, `${mode} ${oid}`]));
  return candidate.entries.every(([path, mode, oid]) => reviewed.get(path) === `${mode} ${oid}`);
}
