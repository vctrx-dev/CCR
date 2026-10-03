/**
 * Context-assessment receipts are independent of review completion. Reuse this boundary for
 * explicit human/agent assessment; a shared-file edit alone never establishes assessment.
 */
import { z } from "zod";
import { isReviewSnapshotCovered, recordReviewCoverage } from "../review/review-coverage";
import {
  type ReviewSnapshot,
  computeCommittedReviewSnapshot,
  computeStagedReviewSnapshot,
  computeWorkingReviewSnapshot,
} from "../review/review-fingerprint";
import {
  assertSafeManagedPath,
  readBoundedTextIfExists,
  writeManagedTextIfUnchanged,
} from "./files";
import { readCurrentCommit } from "./git";
import { branchDetails } from "./journal";

const MAX_ASSESSMENT_CHARACTERS = 2_000;

/**
 * Returns the current branch's receipt path. Receipts are keyed like journal directories so
 * assessing work on one branch never discards another branch's matching receipt.
 */
export function contextAssessmentPath(root: string): string {
  return `.ccr/private/context-assessments/${branchDetails(root).directory}.json`;
}

async function readAssessment(root: string, relativePath: string) {
  return readBoundedTextIfExists(
    await assertSafeManagedPath(root, relativePath),
    MAX_ASSESSMENT_CHARACTERS,
  );
}
const fingerprintSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const commitSchema = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u);
const assessmentSchema = z
  .object({
    codeFingerprint: fingerprintSchema,
    contextFingerprint: fingerprintSchema,
    commit: commitSchema.optional(),
    summary: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .regex(/^[^\r\n]+$/u),
  })
  .strict();

/** Invalid or differently scoped receipts cannot silence an assessment reminder. */
export function isMatchingContextAssessment(
  candidate: unknown,
  code: string,
  context: string,
  commit?: string,
): boolean {
  const parsed = assessmentSchema.safeParse(candidate);
  return (
    parsed.success &&
    parsed.data.codeFingerprint === code &&
    parsed.data.contextFingerprint === context &&
    (parsed.data.commit === undefined || parsed.data.commit === commit)
  );
}

/** Selects working evidence by default, or one explicit immutable current-HEAD assessment target. */
export async function computeContextAssessmentState(root: string, commit?: string) {
  return (await computeContextAssessmentSnapshot(root, commit)).state;
}

async function computeContextAssessmentSnapshot(
  root: string,
  commit?: string,
): Promise<ReviewSnapshot> {
  if (commit === undefined) return computeWorkingReviewSnapshot(root);
  const target = commitSchema.parse(commit);
  const assertHead = () => {
    if (readCurrentCommit(root) !== target) {
      throw new Error("Context assessment commit must match current HEAD.");
    }
  };
  assertHead();
  const snapshot = await computeCommittedReviewSnapshot(root, target);
  assertHead();
  return snapshot;
}

/** Records an explicit assessment only while the caller's reviewed evidence still matches. */
export async function recordContextAssessment(root: string, candidate: unknown): Promise<void> {
  const assessment = assessmentSchema.parse(candidate);
  const receiptPath = contextAssessmentPath(root);
  const previous = await readAssessment(root, receiptPath);
  if (previous?.isTruncated) throw new Error("Existing context assessment exceeds its safe limit.");
  const snapshot = await computeContextAssessmentSnapshot(root, assessment.commit);
  const { state } = snapshot;
  if (
    !isMatchingContextAssessment(
      assessment,
      state.fingerprint,
      state.contextFingerprint,
      assessment.commit,
    )
  ) {
    throw new Error("Context assessment evidence changed; reassess before recording.");
  }
  if (
    !(await writeManagedTextIfUnchanged(
      root,
      receiptPath,
      previous?.content,
      `${JSON.stringify(assessment)}\n`,
    ))
  ) {
    throw new Error("Context assessment changed concurrently; reread before recording.");
  }
  await recordReviewCoverage(root, "assessment", snapshot);
}

/**
 * Checks the staged candidate, or one commit, against the receipt. A candidate made only of assessed,
 * unchanged files counts as assessed; missing or malformed receipts leave the reminder active.
 */
export async function hasCurrentContextAssessment(root: string, commit?: string): Promise<boolean> {
  const text = await readAssessment(root, contextAssessmentPath(root));
  if (text === undefined || text.isTruncated) return false;
  let candidate: unknown;
  try {
    candidate = JSON.parse(text.content);
  } catch {
    return false;
  }
  const receipt = assessmentSchema.safeParse(candidate);
  if (!receipt.success) return false;
  if (receipt.data.commit !== undefined && receipt.data.commit !== commit) return false;
  const snapshot =
    commit === undefined
      ? await computeStagedReviewSnapshot(root)
      : await computeContextAssessmentSnapshot(root, commit);
  return isReviewSnapshotCovered(
    root,
    "assessment",
    {
      fingerprint: receipt.data.codeFingerprint,
      contextFingerprint: receipt.data.contextFingerprint,
    },
    snapshot,
  );
}
