/**
 * Supported review API. These functions keep evidence access on CCR's privacy-filtered boundaries
 * and keep taxonomy validation data-driven for future review orchestrators. Export only stable
 * review contracts here; implementation features must reuse the underlying evidence and taxonomy
 * boundaries rather than reach around them.
 */

export type { SafeReviewChanges } from "./evidence.js";
export { listSafeReviewChanges, readSafeReviewEvidence } from "./evidence.js";

export type { ReviewDimensionRegistry } from "./dimensions.js";
export {
  parseReviewDimensionRegistry,
  renderReviewDimensionReference,
  REVIEW_DIMENSIONS,
  REVIEW_DIMENSION_REFERENCE,
} from "./dimensions.js";
