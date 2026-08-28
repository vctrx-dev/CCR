import { z } from "zod";
import { approveGitInventory } from "./approved-git-inventory";
import {
  normalizeRepositoryPath,
  sortUniqueRepositoryPaths,
  truncateEvidence,
} from "./evidence-format";
import { assertSafeManagedPath, readBoundedUtf8TextIfExists } from "./files";
import {
  readBoundedGitBlob,
  readBoundedStagedDiff,
  readChangedPaths,
  readCommitChangedPaths,
  readCommitEntries,
  readCurrentCommit,
  readIndexEntries,
  readParentCommit,
} from "./git";
import {
  filterExcludedPaths,
  hasControlCharacters,
  readResolvedContextConfig,
  readSafeStagedPaths,
} from "./privacy";

/**
 * Privacy-preserving evidence boundary for context features and future AI integrations. Repository
 * evidence reads the approved Git index; the explicit shared-context operation reads only CCR's
 * three current context documents so uncommitted human edits remain visible. Worktree content must
 * use the bounded filesystem helper rather than adding a direct full-file read. New context
 * evidence features should extend this broker, not recreate its approval and privacy checks.
 */

const MAX_PATH_LIST_CHARACTERS = 6000;
const MAX_EVIDENCE_CHARACTERS = 10_000;
const SHARED_CONTEXT_PATHS = [
  ".ccr/project.md",
  ".ccr/stakeholders.md",
  ".ccr/decisions.md",
] as const;

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

interface SafeCommitInventory {
  paths: string[];
  excludedCount: number;
}

function boundedPathPage(paths: string[], excludedCount: number, after?: string): SafePathList {
  const normalizedAfter = after ? normalizeRepositoryPath(after) : undefined;
  if (
    normalizedAfter &&
    (/^\/|(?:^|\/)\.\.(?:\/|$)/u.test(normalizedAfter) || hasControlCharacters(normalizedAfter))
  ) {
    throw new Error("Cursor must be a safe repository-relative path.");
  }
  const candidates = normalizedAfter
    ? paths.filter((candidate) => candidate.localeCompare(normalizedAfter) > 0)
    : paths;
  const page: string[] = [];
  let usedCharacters = 0;
  for (const candidate of candidates) {
    if (usedCharacters + candidate.length + 3 > MAX_PATH_LIST_CHARACTERS) break;
    page.push(candidate);
    usedCharacters += candidate.length + 3;
  }
  const omittedCount = candidates.length - page.length;
  const nextCursor = omittedCount > 0 ? page.at(-1) : undefined;
  return {
    paths: page,
    excludedCount,
    omittedCount,
    ...(nextCursor ? { nextCursor } : {}),
  };
}

const gitCommitSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u);

function validateCurrentCommit(root: string, commit: string): string {
  const validated = gitCommitSchema.parse(commit);
  if (readCurrentCommit(root) !== validated) {
    throw new Error("Commit evidence is available only for the exact current HEAD.");
  }
  return validated;
}

async function safeCommitFiles(
  root: string,
  commit: string,
): Promise<{
  entriesByPath: Map<string, ReturnType<typeof readCommitEntries>[number]>;
  result: SafeCommitInventory;
}> {
  const validated = validateCurrentCommit(root, commit);
  const config = await readResolvedContextConfig(root);
  const changedPaths = readCommitChangedPaths(root, validated);
  const entries = readCommitEntries(root, validated);
  const parent = readParentCommit(root, validated);
  const parentEntries = parent === "unborn" ? [] : readCommitEntries(root, parent);
  const approved = approveGitInventory({
    baselineEntries: parentEntries,
    candidatePaths: changedPaths,
    currentEntries: entries,
    excludedPatterns: config.privacy.excludedPaths,
  });
  const paths = sortUniqueRepositoryPaths(approved.included);
  validateCurrentCommit(root, validated);
  return {
    entriesByPath: approved.entriesByPath,
    result: {
      paths,
      excludedCount: approved.excluded.length,
    },
  };
}

async function renderRepositoryBlob(root: string, oid: string): Promise<string> {
  const bounded = await readBoundedGitBlob(root, oid, MAX_EVIDENCE_CHARACTERS);
  if (bounded.isBinary) return "[CCR binary repository evidence omitted]\n";
  return truncateEvidence(bounded.content, {
    isTruncated: bounded.isTruncated,
    marker: `[CCR truncated at ${MAX_EVIDENCE_CHARACTERS} characters]`,
    maximumCharacters: MAX_EVIDENCE_CHARACTERS,
  });
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
  const approved = approveGitInventory({
    candidatePaths: entries.map(({ path }) => path),
    currentEntries: entries,
    excludedPatterns: config.privacy.excludedPaths,
  });
  const paths = sortUniqueRepositoryPaths(approved.included);
  return {
    config,
    entriesByPath: approved.entriesByPath,
    paths,
    pathSet: new Set(paths),
    excludedCount: approved.excluded.length,
  };
}

/** Lists safe index roots or one requested prefix without reading worktree content. */
export async function listSafeRepositoryPaths(
  root: string,
  prefix?: string,
  after?: string,
): Promise<SafePathList> {
  const safe = await safeRegularPaths(root);
  const normalizedPrefix = prefix ? normalizeRepositoryPath(prefix) : undefined;
  const normalizedAfter = after ? normalizeRepositoryPath(after) : undefined;
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
  return boundedPathPage(matchingCandidates, safe.excludedCount, normalizedAfter);
}

/** Lists readable current files touched by the latest five commits after privacy filtering. */
export async function listSafeRecentPaths(root: string): Promise<SafeRecentPaths> {
  const safe = await safeRegularPaths(root);
  const recent = readChangedPaths(root, 5);
  const filtered = filterExcludedPaths(recent, safe.config.privacy.excludedPaths);
  const paths = sortUniqueRepositoryPaths(
    filtered.included.filter((candidate) => safe.pathSet.has(normalizeRepositoryPath(candidate))),
  );
  return {
    paths,
    excludedCount: filtered.excluded.length,
  };
}

/** Lists privacy-approved regular files changed by the exact immutable current commit. */
export async function listSafeCommitPaths(
  root: string,
  commit: string,
  after?: string,
): Promise<SafePathList> {
  const safe = (await safeCommitFiles(root, commit)).result;
  return boundedPathPage(safe.paths, safe.excludedCount, after);
}

/** Reads one privacy-approved changed blob from the exact immutable current commit. */
export async function readSafeCommitFile(
  root: string,
  commit: string,
  candidate: string,
): Promise<string> {
  const normalized = normalizeRepositoryPath(candidate);
  const safe = await safeCommitFiles(root, commit);
  if (!safe.result.paths.includes(normalized)) {
    throw new Error("Path is not an approved changed file for the current commit.");
  }
  const entry = safe.entriesByPath.get(normalized);
  const content =
    entry === undefined
      ? "[CCR file deleted in current commit]\n"
      : await renderRepositoryBlob(root, entry.oid);
  validateCurrentCommit(root, commit);
  return content;
}

/** Reads one approved index blob, never a newer unstaged worktree version. */
export async function readSafeRepositoryFile(root: string, candidate: string): Promise<string> {
  const safe = await safeRegularPaths(root);
  const normalized = normalizeRepositoryPath(candidate);
  if (!safe.paths.includes(normalized)) {
    throw new Error("Path is not an approved regular repository file.");
  }
  const entry = safe.entriesByPath.get(normalized);
  if (!entry) throw new Error("Approved index entry disappeared.");
  return renderRepositoryBlob(root, entry.oid);
}

/** Reads one current shared context document, including an uncommitted setup or human edit. */
export async function readSharedContextFile(root: string, candidate: string): Promise<string> {
  const normalized = normalizeRepositoryPath(candidate);
  if (!SHARED_CONTEXT_PATHS.some((approved) => approved === normalized)) {
    throw new Error("Path is not an approved shared context document.");
  }
  const content = await readBoundedUtf8TextIfExists(
    await assertSafeManagedPath(root, normalized),
    MAX_EVIDENCE_CHARACTERS,
  );
  if (content === undefined) throw new Error("Shared context document does not exist.");
  if (content.isBinary) throw new Error("Shared context document is not valid UTF-8 text.");
  return truncateEvidence(content.content, {
    isTruncated: content.isTruncated,
    marker: `[CCR truncated at ${MAX_EVIDENCE_CHARACTERS} characters]`,
    maximumCharacters: MAX_EVIDENCE_CHARACTERS,
  });
}

/** Reads the staged diff for one approved path without opening its worktree file. */
export async function readSafeRepositoryDiff(root: string, candidate: string): Promise<string> {
  const normalized = normalizeRepositoryPath(candidate);
  const safePaths = await readSafeStagedPaths(root);
  if (!safePaths.included.includes(normalized)) {
    throw new Error("Path is not an approved staged file.");
  }
  const bounded = await readBoundedStagedDiff(root, normalized, MAX_EVIDENCE_CHARACTERS);
  if (bounded.isBinary) return "[CCR binary staged diff omitted]\n";
  return truncateEvidence(bounded.content, {
    isTruncated: bounded.isTruncated,
    marker: `[CCR truncated at ${MAX_EVIDENCE_CHARACTERS} characters]`,
    maximumCharacters: MAX_EVIDENCE_CHARACTERS,
  });
}
