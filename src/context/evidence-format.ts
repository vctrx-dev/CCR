/**
 * Shared presentation primitives for approved repository evidence. Authorization remains owned by
 * each evidence boundary; reuse these helpers only after a path or content source is already safe.
 * Add shared normalization or rendering behavior here, but never move authorization into it.
 */

export interface EvidenceTruncationOptions {
  isTruncated?: boolean;
  marker: string;
  maximumCharacters: number;
}

/** Normalizes Git and filesystem path separators for stable approval and presentation checks. */
export function normalizeRepositoryPath(value: string): string {
  return value.replaceAll("\\", "/");
}

/** Returns normalized repository paths once each in locale-stable presentation order. */
export function sortUniqueRepositoryPaths(paths: string[]): string[] {
  return [...new Set(paths.map(normalizeRepositoryPath))].sort((left, right) =>
    left.localeCompare(right),
  );
}

/**
 * Returns a bounded evidence string with an explicit caller-owned truncation marker.
 * This only formats already-authorized content; it never validates paths or reads a data source.
 */
export function truncateEvidence(content: string, options: EvidenceTruncationOptions): string {
  const { isTruncated = false, marker, maximumCharacters } = options;
  if (!Number.isSafeInteger(maximumCharacters) || maximumCharacters < 1) {
    throw new Error("Evidence truncation requires a positive safe character limit.");
  }
  if (marker.trim().length === 0) {
    throw new Error("Evidence truncation requires a non-empty marker.");
  }
  if (!isTruncated && content.length <= maximumCharacters) return content;
  return `${content.slice(0, maximumCharacters)}\n${marker}\n`;
}
