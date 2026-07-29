import { readGitBlob, readIndexEntries, readStagedDiff } from "./git";
import {
  filterExcludedPaths,
  hasControlCharacters,
  readResolvedContextConfig,
  readSafeStagedPaths,
} from "./privacy";

export interface SafePathList {
  paths: string[];
  excludedCount: number;
  omittedCount: number;
}

function truncate(content: string, limit: number): string {
  if (content.length <= limit) return content;
  return `${content.slice(0, limit)}\n[CCR truncated at ${limit} characters]\n`;
}

async function safeRegularPaths(root: string): Promise<{
  config: Awaited<ReturnType<typeof readResolvedContextConfig>>;
  paths: string[];
  excludedCount: number;
}> {
  const config = await readResolvedContextConfig(root);
  const entries = readIndexEntries(root);
  const regularPaths = entries
    .filter((entry) => entry.mode.startsWith("100"))
    .map((entry) => entry.path);
  const filtered = filterExcludedPaths(regularPaths, config.privacy.excludedPaths);
  return {
    config,
    paths: filtered.included.sort((left, right) => left.localeCompare(right)),
    excludedCount: filtered.excluded.length + entries.length - regularPaths.length,
  };
}

/** Lists safe index roots or one requested prefix without reading worktree content. */
export async function listSafeRepositoryPaths(
  root: string,
  prefix?: string,
): Promise<SafePathList> {
  const safe = await safeRegularPaths(root);
  const normalizedPrefix = prefix?.replaceAll("\\", "/");
  if (
    normalizedPrefix &&
    (/^\/|(?:^|\/)\.\.(?:\/|$)/u.test(normalizedPrefix) || hasControlCharacters(normalizedPrefix))
  ) {
    throw new Error("Prefix must be a safe repository-relative path.");
  }
  const candidates = normalizedPrefix
    ? safe.paths.filter((candidate) => candidate.startsWith(normalizedPrefix))
    : [...new Set(safe.paths.map((candidate) => candidate.split("/")[0] ?? candidate))];
  const paths: string[] = [];
  let usedCharacters = 0;
  for (const candidate of candidates) {
    if (usedCharacters + candidate.length + 3 > safe.config.context.maxIndexCharacters) break;
    paths.push(candidate);
    usedCharacters += candidate.length + 3;
  }
  return {
    paths,
    excludedCount: safe.excludedCount,
    omittedCount: candidates.length - paths.length,
  };
}

/** Reads one approved index blob, never a newer unstaged worktree version. */
export async function readSafeRepositoryFile(root: string, candidate: string): Promise<string> {
  const safe = await safeRegularPaths(root);
  const normalized = candidate.replaceAll("\\", "/");
  if (!safe.paths.includes(normalized)) {
    throw new Error("Path is not an approved regular repository file.");
  }
  const entry = readIndexEntries(root).find((item) => item.path === normalized);
  if (!entry) throw new Error("Approved index entry disappeared.");
  return truncate(readGitBlob(root, entry.oid), safe.config.context.maxFileCharacters);
}

/** Reads the staged diff for one approved path without opening its worktree file. */
export async function readSafeRepositoryDiff(root: string, candidate: string): Promise<string> {
  const config = await readResolvedContextConfig(root);
  const normalized = candidate.replaceAll("\\", "/");
  const safePaths = await readSafeStagedPaths(root);
  if (!safePaths.included.includes(normalized)) {
    throw new Error("Path is not an approved staged file.");
  }
  return truncate(readStagedDiff(root, normalized), config.context.maxFileCharacters);
}
