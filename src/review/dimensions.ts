import { z } from "zod";
import { MANAGED_SKILL_MARKER } from "../context/skill-marker";
import { renderDimensionWorkerPrompt } from "./dimension-worker-prompt";
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

/** Renders standalone single-agent dimension prompts; `##` headings are the selector IDs. */
export function renderReviewDimensionReference(input: unknown): string {
  const registry = parseReviewDimensionRegistry(input);
  const prompts = registry.dimensions.map((dimension) => {
    const prompt = renderDimensionWorkerPrompt(dimension, "the current codebase").trimEnd();
    return `## ${dimension.id}\n\n\`\`\`\`markdown\n${prompt}\n\`\`\`\``;
  });
  const body = prompts.length
    ? prompts.join("\n\n")
    : "No review dimensions are configured. Stop and ask the maintainer to populate `src/review/dimensions.json`.";
  return `---
name: ccr-review-dimensions
description: Reference copy of the CCR single-agent dimension prompts for people; skills do not load it.
---

${MANAGED_SKILL_MARKER}
# CCR dimension prompts

${body}
`;
}

export const REVIEW_DIMENSIONS = parseReviewDimensionRegistry(dimensionData);
export const REVIEW_DIMENSION_REFERENCE = renderReviewDimensionReference(REVIEW_DIMENSIONS);
