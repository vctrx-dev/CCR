import { readManagedTextIfExists, writeManagedText } from "./files";
import { upsertManagedBlock } from "./managed-block";
import type { ManagedBlock } from "./managed-block";
import { IGNORE_BLOCK } from "./templates";

/**
 * Local-continuity ignore boundary. Keeps per-developer journals and private state outside Git even
 * when hooks start journaling before `ccr setup` runs. Reuse this instead of duplicating ignore rules.
 */

export type IgnoreOutcome = "created" | "unchanged";

function ignoreBlock(content: string): ManagedBlock {
  return {
    content,
    end: content.slice(content.lastIndexOf("\n") + 1),
    start: content.slice(0, content.indexOf("\n")),
  };
}

/** Returns the proposed `.gitignore` text after upserting the local-continuity block. */
export function localIgnoreContent(existing: string | undefined): string {
  return upsertManagedBlock(existing, ignoreBlock(IGNORE_BLOCK), ".gitignore");
}

/** Writes the local-continuity block when absent, leaving unrelated ignore rules untouched. */
export async function ensureLocalIgnoreRules(root: string): Promise<IgnoreOutcome> {
  const existing = await readManagedTextIfExists(root, ".gitignore");
  const updated = localIgnoreContent(existing);
  if (updated === existing) return "unchanged";
  await writeManagedText(root, ".gitignore", updated);
  return "created";
}
