import { assertSafeManagedPath, readBoundedUtf8TextIfExists } from "../context/files";
import { MAX_MANAGED_JSON_CHARACTERS, parseManagedJsonArtifact } from "../context/managed-json";
import {
  REVIEW_DIMENSIONS,
  type ReviewDimensionRegistry,
  parseReviewDimensionRegistry,
} from "./dimensions";

/**
 * Repository taxonomy input boundary. Every operation rereads the editable JSON; only an absent
 * file falls back to packaged defaults. Extend the shared registry parser, not a second taxonomy.
 */
export const REVIEW_DIMENSIONS_PATH = ".ccr/dimensions.json";

/** Reads bounded, non-symlink repository taxonomy; invalid input never silently uses defaults. */
export async function readReviewDimensionRegistry(root: string): Promise<ReviewDimensionRegistry> {
  const bounded = await readBoundedUtf8TextIfExists(
    await assertSafeManagedPath(root, REVIEW_DIMENSIONS_PATH),
    MAX_MANAGED_JSON_CHARACTERS,
  );
  if (bounded === undefined) return parseReviewDimensionRegistry(REVIEW_DIMENSIONS);
  if (bounded.isTruncated)
    throw new Error("Review dimensions exceeded their safe character limit.");
  if (bounded.isBinary) throw new Error("Review dimensions must be valid UTF-8 text.");
  const { data } = parseManagedJsonArtifact(bounded.content);
  try {
    return parseReviewDimensionRegistry(data);
  } catch {
    // Schema errors can echo unknown keys or duplicate IDs; repository input is not a diagnostic.
    throw new Error(
      "Review dimensions are invalid: check required fields, unique IDs, and registry structure.",
    );
  }
}
