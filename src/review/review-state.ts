/**
 * Stable review-state facade.
 *
 * Fingerprint calculation and journal continuity are separate concerns. Keep imports through this
 * module when callers need the supported review-state contract; extend the focused implementation
 * module when adding behavior to only one concern.
 */
export type { ReviewContextState, ReviewState } from "./review-fingerprint";
export {
  computeCommittedReviewState,
  computeReviewContextFingerprint,
  computeReviewContextState,
  computeStagedReviewState,
  computeWorkingReviewState,
} from "./review-fingerprint";
export type { ReviewFreshness, ReviewFreshnessStatus } from "./review-continuity";
export {
  readStagedReviewFreshness,
  reconcileCommittedReviewState,
  recordWorkingReviewState,
} from "./review-continuity";
