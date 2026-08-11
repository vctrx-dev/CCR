import { readManagedTextIfExists, writeManagedText } from "./files";
import { managedBlock, upsertManagedBlock } from "./managed-block";
import { IGNORE_BLOCK } from "./templates";

/**
 * Local-continuity ignore boundary. Keeps per-developer journals and private state outside Git even
 * when hooks start journaling before `ccr setup` runs. Reuse this instead of duplicating ignore rules.
 */

export type IgnoreOutcome = "created" | "unchanged";

/** Returns the proposed `.gitignore` text after upserting the local-continuity block. */
export function localIgnoreContent(existing: string | undefined): string {
  return upsertManagedBlock(existing, managedBlock(IGNORE_BLOCK), ".gitignore");
}

/** Writes the local-continuity block when absent, leaving unrelated ignore rules untouched. */
export async function ensureLocalIgnoreRules(root: string): Promise<IgnoreOutcome> {
  const existing = await readManagedTextIfExists(root, ".gitignore");
  const updated = localIgnoreContent(existing);
  if (updated === existing) return "unchanged";
  await writeManagedText(root, ".gitignore", updated);
  return "created";
}
