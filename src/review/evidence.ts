import { lstat } from "node:fs/promises";
import {
  normalizeRepositoryPath,
  sortUniqueRepositoryPaths,
  truncateEvidence,
} from "../context/evidence-format";
import {
  assertSafeManagedPath,
  readBoundedUtf8TextIfExists,
  readRegularFileGitMode,
} from "../context/files";
import {
  readBoundedStagedDiff,
  readBoundedUnstagedDiff,
  readIndexEntries,
  readUnstagedPaths,
  readUntrackedPaths,
} from "../context/git";
import {
  filterExcludedPaths,
  readResolvedContextConfig,
  readSafeStagedPaths,
} from "../context/privacy";

/**
 * Privacy-preserving live-change boundary for review skills. It exposes only Git-selected staged,
 * unstaged, and untracked evidence after the shared exclusion policy and regular-file checks.
 * Worktree evidence must use the bounded filesystem helper rather than a direct full-file read.
 * New review evidence capabilities should extend this boundary, not bypass its filtering or create
 * a separate live-change reader.
 */

const MAX_REVIEW_EVIDENCE_CHARACTERS = 20_000;
const MAX_REVIEW_CHANGE_PATHS = 5_000;

export interface SafeReviewChanges {
  stagedPaths: string[];
  unstagedPaths: string[];
  untrackedPaths: string[];
  excludedPathCount: number;
}

/** Returns whether the current approved live overlay requires working-state continuity. */
export function hasSafeReviewChanges(changes: SafeReviewChanges): boolean {
  return (
    changes.stagedPaths.length + changes.unstagedPaths.length + changes.untrackedPaths.length > 0
  );
}

/** Lists safe live change paths, retaining separate staged/unstaged states for partially staged files. */
export async function listSafeReviewChanges(root: string): Promise<SafeReviewChanges> {
  const [config, staged] = await Promise.all([
    readResolvedContextConfig(root),
    readSafeStagedPaths(root),
  ]);
  const regularTrackedPaths = new Set(
    readIndexEntries(root)
      .filter(({ mode }) => mode.startsWith("100"))
      .map(({ path: relativePath }) => relativePath),
  );
  const unstagedFiltered = filterExcludedPaths(
    readUnstagedPaths(root),
    config.privacy.excludedPaths,
  );
  const unstagedPaths = unstagedFiltered.included.filter((candidate) =>
    regularTrackedPaths.has(candidate),
  );
  const unsafeUnstagedPaths = unstagedFiltered.included.filter(
    (candidate) => !regularTrackedPaths.has(candidate),
  );
  const untrackedFiltered = filterExcludedPaths(
    readUntrackedPaths(root),
    config.privacy.excludedPaths,
  );
  const overlayPaths = new Set(
    [...staged.included, ...unstagedFiltered.included, ...untrackedFiltered.included].map(
      normalizeRepositoryPath,
    ),
  );
  if (overlayPaths.size > MAX_REVIEW_CHANGE_PATHS) {
    throw new Error(`Review change set exceeds ${MAX_REVIEW_CHANGE_PATHS} paths.`);
  }
  const untrackedChecks = await Promise.all(
    untrackedFiltered.included.map(async (candidate) => ({
      candidate,
      isRegular: (await readRegularFileGitMode(root, candidate)) !== undefined,
    })),
  );
  const untrackedPaths = untrackedChecks
    .filter(({ isRegular }) => isRegular)
    .map(({ candidate }) => candidate);
  const unsafeUntrackedPaths = untrackedChecks
    .filter(({ isRegular }) => !isRegular)
    .map(({ candidate }) => candidate);
  const excludedPaths = new Set(
    [
      ...staged.excluded,
      ...unstagedFiltered.excluded,
      ...untrackedFiltered.excluded,
      ...unsafeUnstagedPaths,
      ...unsafeUntrackedPaths,
    ].map(normalizeRepositoryPath),
  );
  return {
    stagedPaths: sortUniqueRepositoryPaths(staged.included),
    unstagedPaths: sortUniqueRepositoryPaths(unstagedPaths),
    untrackedPaths: sortUniqueRepositoryPaths(untrackedPaths),
    excludedPathCount: excludedPaths.size,
  };
}

/** Reads bounded current evidence for one path previously approved by `listSafeReviewChanges`. */
export async function readSafeReviewEvidence(root: string, candidate: string): Promise<string> {
  const normalized = normalizeRepositoryPath(candidate);
  const changes = await listSafeReviewChanges(root);
  const isStaged = changes.stagedPaths.includes(normalized);
  const isUnstaged = changes.unstagedPaths.includes(normalized);
  const isUntracked = changes.untrackedPaths.includes(normalized);
  if (!isStaged && !isUnstaged && !isUntracked) {
    throw new Error("Path is not approved review evidence.");
  }
  const sections: string[] = [];
  let hasTruncatedEvidence = false;
  if (isStaged) {
    const staged = await readBoundedStagedDiff(root, normalized, MAX_REVIEW_EVIDENCE_CHARACTERS);
    hasTruncatedEvidence ||= staged.isTruncated;
    sections.push(
      `## Staged diff\n\n${staged.isBinary ? "[CCR binary staged diff omitted]" : staged.content}`,
    );
  }
  if (isUnstaged) {
    const unstaged = await readBoundedUnstagedDiff(
      root,
      normalized,
      MAX_REVIEW_EVIDENCE_CHARACTERS,
    );
    hasTruncatedEvidence ||= unstaged.isTruncated;
    sections.push(
      `## Unstaged diff\n\n${unstaged.isBinary ? "[CCR binary unstaged diff omitted]" : unstaged.content}`,
    );
  }
  if (isUntracked) {
    const target = await assertSafeManagedPath(root, normalized);
    if (!(await lstat(target)).isFile())
      throw new Error("Approved review path is no longer regular.");
    const content = await readBoundedUtf8TextIfExists(target, MAX_REVIEW_EVIDENCE_CHARACTERS);
    if (content === undefined) throw new Error("Approved review path no longer exists.");
    hasTruncatedEvidence = content.isTruncated;
    sections.push(
      `## Untracked file\n\n${content.isBinary ? "[CCR binary review evidence omitted]" : content.content}`,
    );
  }
  return truncateEvidence(`${sections.join("\n\n")}\n`, {
    isTruncated: hasTruncatedEvidence,
    marker: `[CCR truncated review evidence at ${MAX_REVIEW_EVIDENCE_CHARACTERS} characters]`,
    maximumCharacters: MAX_REVIEW_EVIDENCE_CHARACTERS,
  });
}
