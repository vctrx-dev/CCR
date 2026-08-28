import { normalizeRepositoryPath } from "./evidence-format";
import type { IndexEntry } from "./git";
import { filterExcludedPaths } from "./path-privacy";

/**
 * Pure approval boundary for Git tree and index inventories. It combines path privacy with regular
 * mode checks across the selected state and its baseline, without reading repository content.
 */

export interface ApprovedGitInventory {
  entriesByPath: Map<string, IndexEntry>;
  excluded: string[];
  included: string[];
}

interface GitInventoryInput {
  baselineEntries?: IndexEntry[];
  candidatePaths: string[];
  currentEntries: IndexEntry[];
  excludedPatterns: string[];
}

/** Approves only privacy-allowed paths that remain regular in every relevant Git state. */
export function approveGitInventory({
  baselineEntries = [],
  candidatePaths,
  currentEntries,
  excludedPatterns,
}: GitInventoryInput): ApprovedGitInventory {
  const relevantEntries = [...currentEntries, ...baselineEntries];
  const regularPaths = new Set(
    relevantEntries.filter(({ mode }) => mode.startsWith("100")).map(({ path }) => path),
  );
  const unsafePaths = new Set(
    relevantEntries.filter(({ mode }) => !mode.startsWith("100")).map(({ path }) => path),
  );
  const filtered = filterExcludedPaths(candidatePaths, excludedPatterns);
  const included = filtered.included.filter((candidate) => {
    const normalized = normalizeRepositoryPath(candidate);
    return regularPaths.has(normalized) && !unsafePaths.has(normalized);
  });
  const modeExcluded = filtered.included.filter((candidate) => !included.includes(candidate));
  const entriesByPath = new Map<string, IndexEntry>();
  for (const entry of currentEntries) {
    if (entry.mode.startsWith("100") && !entriesByPath.has(entry.path)) {
      entriesByPath.set(entry.path, entry);
    }
  }
  return { entriesByPath, excluded: [...filtered.excluded, ...modeExcluded], included };
}
