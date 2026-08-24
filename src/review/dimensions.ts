import { z } from "zod";
import { MANAGED_SKILL_MARKER } from "../context/skill-marker";
import dimensionData from "./dimensions.json";

/**
 * Shared data-driven review taxonomy. Add or revise dimensions in `dimensions.json` and validate
 * through this module; review features must not introduce a second hard-coded criteria registry.
 */

const dimensionIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);

const reviewCriterionSchema = z
  .object({
    id: dimensionIdSchema,
    name: z.string().trim().min(1),
    details: z.string().trim().min(1),
  })
  .strict();

const reviewDimensionSchema = z
  .object({
    id: dimensionIdSchema,
    name: z.string().trim().min(1),
    summary: z.string().trim().min(1),
    criteria: z.array(reviewCriterionSchema).min(1),
  })
  .strict();

const reviewDimensionRegistrySchema = z
  .object({
    dimensions: z.array(reviewDimensionSchema),
  })
  .strict();

export type ReviewDimensionRegistry = z.infer<typeof reviewDimensionRegistrySchema>;

function duplicate(values: string[]): string | undefined {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return undefined;
}

/**
 * Validates the data-only review taxonomy before it is embedded in installed skills. Dimension and
 * criterion IDs are stable selectors; edit the JSON registry rather than review orchestration code.
 */
export function parseReviewDimensionRegistry(input: unknown): ReviewDimensionRegistry {
  const registry = reviewDimensionRegistrySchema.parse(input);
  const duplicateDimension = duplicate(registry.dimensions.map(({ id }) => id));
  if (duplicateDimension) throw new Error(`Duplicate dimension ID: ${duplicateDimension}`);
  for (const dimension of registry.dimensions) {
    const duplicateCriterion = duplicate(dimension.criteria.map(({ id }) => id));
    if (duplicateCriterion) {
      throw new Error(`Duplicate criterion ID in ${dimension.id}: ${duplicateCriterion}`);
    }
  }
  return registry;
}

/** Renders the validated taxonomy as a package-owned, progressively loaded skill reference. */
export function renderReviewDimensionReference(input: unknown): string {
  const registry = parseReviewDimensionRegistry(input);
  const emptyNotice = registry.dimensions.length
    ? "Use only the dimensions selected by the invoking skill."
    : "No review dimensions are configured. Stop the review and ask the maintainer to populate `src/review/dimensions.json`; do not invent dimensions or criteria.";
  return `---
name: ccr-review-dimensions
description: CCR's package-managed review taxonomy loaded by ccr-review and ccr-codebase.
---

${MANAGED_SKILL_MARKER}
# CCR review dimensions

${emptyNotice}

The array order is the canonical order for selection, coverage ledgers, and reports. Each dimension
owns its fixed criteria; treat each criterion's details as binding review guidance. Apply criteria
within their parent dimension and never remove a selected dimension from coverage.

\`\`\`json
${JSON.stringify(registry, null, 2)}
\`\`\`
`;
}

export const REVIEW_DIMENSIONS = parseReviewDimensionRegistry(dimensionData);
export const REVIEW_DIMENSION_REFERENCE = renderReviewDimensionReference(REVIEW_DIMENSIONS);
