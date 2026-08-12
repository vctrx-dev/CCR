import { readChangedPaths, readGitBlob, readIndexEntries, readStagedDiff } from "./git";
import {
  filterExcludedPaths,
  hasControlCharacters,
  readResolvedContextConfig,
  readSafeStagedPaths,
} from "./privacy";

/**
 * Privacy-preserving evidence boundary for context features and future AI integrations. Reuse these
 * operations for repository content: they read approved Git-index data, never newer worktree content.
 */

const MAX_PATH_LIST_CHARACTERS = 6000;
const MAX_EVIDENCE_CHARACTERS = 10_000;

export interface SafePathList {
  paths: string[];
  excludedCount: number;
  omittedCount: number;
  nextCursor?: string;
}

export interface SafeRecentPaths {
  paths: string[];
  excludedCount: number;
}

function truncate(content: string, limit: number): string {
  if (content.length <= limit) return content;
  return `${content.slice(0, limit)}\n[CCR truncated at ${limit} characters]\n`;
}

async function safeRegularPaths(root: string): Promise<{
  config: Awaited<ReturnType<typeof readResolvedContextConfig>>;
  entriesByPath: Map<string, ReturnType<typeof readIndexEntries>[number]>;
  paths: string[];
  pathSet: Set<string>;
  excludedCount: number;
}> {
  const config = await readResolvedContextConfig(root);
  const entries = readIndexEntries(root);
  const regularPaths = entries
    .filter((entry) => entry.mode.startsWith("100"))
    .map((entry) => entry.path);
  const filtered = filterExcludedPaths(regularPaths, config.privacy.excludedPaths);
  const paths = filtered.included.sort((left, right) => left.localeCompare(right));
  const entriesByPath = new Map<string, ReturnType<typeof readIndexEntries>[number]>();
  for (const entry of entries) {
    if (!entriesByPath.has(entry.path)) entriesByPath.set(entry.path, entry);
  }
  return {
    config,
    entriesByPath,
    paths,
    pathSet: new Set(paths),
    excludedCount: filtered.excluded.length + entries.length - regularPaths.length,
  };
}

/** Lists safe index roots or one requested prefix without reading worktree content. */
export async function listSafeRepositoryPaths(
  root: string,
  prefix?: string,
  after?: string,
): Promise<SafePathList> {
  const safe = await safeRegularPaths(root);
  const normalizedPrefix = prefix?.replaceAll("\\", "/");
  const normalizedAfter = after?.replaceAll("\\", "/");
  for (const [label, candidate] of [
    ["Prefix", normalizedPrefix],
    ["Cursor", normalizedAfter],
  ]) {
    if (
      candidate &&
      (/^\/|(?:^|\/)\.\.(?:\/|$)/u.test(candidate) || hasControlCharacters(candidate))
    ) {
      throw new Error(`${label} must be a safe repository-relative path.`);
    }
  }
  const pathPrefix = normalizedPrefix?.replace(/\/+$/u, "");
  const matchingCandidates = pathPrefix
    ? safe.paths.filter(
        (candidate) => candidate === pathPrefix || candidate.startsWith(`${pathPrefix}/`),
      )
    : [...new Set(safe.paths.map((candidate) => candidate.split("/")[0] ?? candidate))];
  const candidates = normalizedAfter
    ? matchingCandidates.filter((candidate) => candidate.localeCompare(normalizedAfter) > 0)
    : matchingCandidates;
  const paths: string[] = [];
  let usedCharacters = 0;
  for (const candidate of candidates) {
    if (usedCharacters + candidate.length + 3 > MAX_PATH_LIST_CHARACTERS) break;
    paths.push(candidate);
    usedCharacters += candidate.length + 3;
  }
  const omittedCount = candidates.length - paths.length;
  const nextCursor = omittedCount > 0 ? paths.at(-1) : undefined;
  return {
    paths,
    excludedCount: safe.excludedCount,
    omittedCount,
    ...(nextCursor ? { nextCursor } : {}),
  };
}

/** Lists readable current files touched by the latest five commits after privacy filtering. */
export async function listSafeRecentPaths(root: string): Promise<SafeRecentPaths> {
  const safe = await safeRegularPaths(root);
  const recent = readChangedPaths(root, 5);
  const filtered = filterExcludedPaths(recent, safe.config.privacy.excludedPaths);
  const paths = filtered.included
    .filter((candidate) => safe.pathSet.has(candidate))
    .sort((left, right) => left.localeCompare(right));
  return {
    paths,
    excludedCount: filtered.excluded.length,
  };
}

/** Reads one approved index blob, never a newer unstaged worktree version. */
export async function readSafeRepositoryFile(root: string, candidate: string): Promise<string> {
  const safe = await safeRegularPaths(root);
  const normalized = candidate.replaceAll("\\", "/");
  if (!safe.paths.includes(normalized)) {
    throw new Error("Path is not an approved regular repository file.");
  }
  const entry = safe.entriesByPath.get(normalized);
  if (!entry) throw new Error("Approved index entry disappeared.");
  return truncate(readGitBlob(root, entry.oid), MAX_EVIDENCE_CHARACTERS);
}

/** Reads the staged diff for one approved path without opening its worktree file. */
export async function readSafeRepositoryDiff(root: string, candidate: string): Promise<string> {
  const normalized = candidate.replaceAll("\\", "/");
  const safePaths = await readSafeStagedPaths(root);
  if (!safePaths.included.includes(normalized)) {
    throw new Error("Path is not an approved staged file.");
  }
  return truncate(readStagedDiff(root, normalized), MAX_EVIDENCE_CHARACTERS);
}
