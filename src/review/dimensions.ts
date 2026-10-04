import { z } from "zod";
import { MANAGED_SKILL_MARKER } from "../context/skill-marker";
import { renderDimensionSection } from "./dimension-worker-prompt";
import dimensionData from "./dimensions.json";

/**
 * Shared data-driven review taxonomy. Add or revise dimensions in `dimensions.json` and validate
 * through this module; review features must not introduce a second hard-coded criteria registry.
 */

const dimensionIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);

const reviewCriterionSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/u),
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
 * IDs retain their declared case: dimension selectors are lowercase, while research criterion IDs
 * may contain uppercase letters. Edit the JSON registry rather than review orchestration code.
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

/**
 * Validates a new review's comma-separated selection against its live taxonomy. Matching is exact
 * apart from case and surrounding whitespace; spelling correction belongs to the skill, not this
 * API. Subsets are returned in registry order, and `all` remains the standalone all-dimensions token.
 * Historical journal readers must not use this boundary: their IDs may no longer be configured.
 */
export function parseReviewDimensionSelection(selection: unknown, input: unknown): string {
  const registry = parseReviewDimensionRegistry(input);
  if (registry.dimensions.length === 0) {
    throw new Error(
      "No review dimensions are configured; populate the live taxonomy before reviewing.",
    );
  }
  const selectors = z
    .string()
    .trim()
    .min(1, "Select all or at least one configured review dimension.")
    .parse(selection)
    .split(",")
    .map((selector) => selector.trim().toLowerCase());
  if (selectors.includes("all")) {
    if (selectors.length !== 1) {
      throw new Error("The all selector must be used alone.");
    }
    return "all";
  }
  const ids = registry.dimensions.map(({ id }) => id);
  const known = new Set(ids);
  if (selectors.some((selector) => !known.has(selector))) {
    throw new Error(`Unknown review dimension selection. Valid choices: all, ${ids.join(", ")}.`);
  }
  if (duplicate(selectors)) {
    throw new Error("Review dimension selection must not contain duplicate IDs.");
  }
  const selected = new Set(selectors);
  return ids.filter((id) => selected.has(id)).join(",");
}

/** Renders only the JSON-derived middle of the review prompt, using the shared criterion renderer. */
export function renderReviewDimensionSections(input: unknown): string {
  const registry = parseReviewDimensionRegistry(input);
  return registry.dimensions
    .map((dimension) => `## ${dimension.id}\n\n${renderDimensionSection(dimension)}`)
    .join("\n\n");
}

/**
 * Renders the package/installed Markdown reference from validated JSON. Each dimension and criterion
 * has a real heading, qualified by IDs so repeated names remain distinguishable. Reviews choose
 * links from this artifact rather than maintaining a second registry of link targets.
 */
export function renderReviewDimensionReference(input: unknown): string {
  const registry = parseReviewDimensionRegistry(input);
  const sections = registry.dimensions.map((dimension) => {
    const criteria = dimension.criteria
      .map(({ id, name, details }) => `### ${dimension.id} / ${id} — ${name}\n\n${details}`)
      .join("\n\n");
    return `## ${dimension.id} — ${dimension.name}\n\n${dimension.summary}\n\n${criteria}`;
  });
  const body = sections.length
    ? sections.join("\n\n---\n\n")
    : "No review dimensions are configured. Stop and ask the maintainer to populate `src/review/dimensions.json`.";
  return `---
name: ccr-review-dimensions
description: JSON-generated CCR dimensions and criteria for people and finding references.
---

${MANAGED_SKILL_MARKER}
# CCR dimensions and criteria

Generated from the packaged \`dimensions.json\`. Setup/update installs this reference; edit the JSON,
not this managed file. Reviews load the live repository taxonomy separately and link only matching
entries here. Custom entries absent from this packaged reference have no reference target.

${body}
`;
}

export const REVIEW_DIMENSIONS = parseReviewDimensionRegistry(dimensionData);
export const REVIEW_DIMENSION_REFERENCE = renderReviewDimensionReference(REVIEW_DIMENSIONS);
