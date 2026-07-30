/**
 * Reusable marked-text operations for non-executable integration files such as instruction files
 * and `.gitignore`. Use this instead of copying marker parsing; hooks retain stricter validation.
 */
export interface ManagedBlock {
  content: string;
  end: string;
  start: string;
}

function markerCount(content: string, marker: string): number {
  return content.split(marker).length - 1;
}

/** Upserts one marked text block while rejecting malformed or duplicate markers. */
export function upsertManagedBlock(
  existing: string | undefined,
  block: ManagedBlock,
  relativePath: string,
): string {
  const startCount = existing ? markerCount(existing, block.start) : 0;
  const endCount = existing ? markerCount(existing, block.end) : 0;
  if (startCount !== endCount || startCount > 1) {
    throw new Error(`CCR managed block conflict in ${relativePath}.`);
  }
  if (startCount === 1 && existing) {
    if (existing.indexOf(block.start) > existing.indexOf(block.end)) {
      throw new Error(`CCR managed block conflict in ${relativePath}.`);
    }
    const escapedStart = block.start.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedEnd = block.end.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return existing.replace(new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}`), block.content);
  }
  const base = existing?.trimEnd();
  return `${base ? `${base}\n\n` : ""}${block.content}\n`;
}

/** Removes the first complete marked text block and normalizes the surrounding whitespace. */
export function removeManagedBlock(content: string, block: ManagedBlock): string {
  const startIndex = content.indexOf(block.start);
  const endIndex = content.indexOf(block.end, startIndex);
  if (startIndex < 0 || endIndex < 0) return content;
  const before = content.slice(0, startIndex).trimEnd();
  const after = content.slice(endIndex + block.end.length).trimStart();
  return `${before}${before && after ? "\n\n" : ""}${after}${before || after ? "\n" : ""}`;
}
