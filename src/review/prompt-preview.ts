/**
 * Contributor preview adapter: selects one validated dimension for the shared worker prompt.
 * Keep selection here and prompt wording in dimension-worker-prompt.ts; no repository mutation.
 */
import { z } from "zod";
import { renderDimensionWorkerPrompt } from "./dimension-worker-prompt";
import { REVIEW_DIMENSIONS, parseReviewDimensionRegistry } from "./dimensions";

/** Renders the first current dimension; rejects arguments and empty or invalid registries. */
export function renderPromptPreview(args: unknown, input: unknown = REVIEW_DIMENSIONS): string {
  z.array(z.string()).length(0).parse(args);
  const registry = parseReviewDimensionRegistry(input);
  const dimension = registry.dimensions[0];
  if (!dimension) throw new Error("No review dimensions configured.");
  return renderDimensionWorkerPrompt(dimension, "the current codebase");
}
