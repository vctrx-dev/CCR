import { lstat, readFile } from "node:fs/promises";
import { assertSafeManagedPath, isFileNotFound } from "../context/files";
import {
  readIndexEntries,
  readStagedDiff,
  readUnstagedDiff,
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
 */

const MAX_REVIEW_EVIDENCE_CHARACTERS = 20_000;

export interface SafeReviewChanges {
  stagedPaths: string[];
  unstagedPaths: string[];
  untrackedPaths: string[];
  excludedPathCount: number;
}

function sortPaths(paths: string[]): string[] {
  return [...new Set(paths.map((candidate) => candidate.replaceAll("\\", "/")))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function truncate(content: string): string {
  if (content.length <= MAX_REVIEW_EVIDENCE_CHARACTERS) return content;
  return `${content.slice(0, MAX_REVIEW_EVIDENCE_CHARACTERS)}\n[CCR truncated review evidence at ${MAX_REVIEW_EVIDENCE_CHARACTERS} characters]\n`;
}

async function isRegularWorktreeFile(root: string, relativePath: string): Promise<boolean> {
  try {
    return (await lstat(await assertSafeManagedPath(root, relativePath))).isFile();
  } catch (error: unknown) {
    if (isFileNotFound(error)) return false;
    throw error;
  }
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
  const untrackedChecks = await Promise.all(
    untrackedFiltered.included.map(async (candidate) => ({
      candidate,
      isRegular: await isRegularWorktreeFile(root, candidate),
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
    ].map((candidate) => candidate.replaceAll("\\", "/")),
  );
  return {
    stagedPaths: sortPaths(staged.included),
    unstagedPaths: sortPaths(unstagedPaths),
    untrackedPaths: sortPaths(untrackedPaths),
    excludedPathCount: excludedPaths.size,
  };
}

/** Reads bounded current evidence for one path previously approved by `listSafeReviewChanges`. */
export async function readSafeReviewEvidence(root: string, candidate: string): Promise<string> {
  const normalized = candidate.replaceAll("\\", "/");
  const changes = await listSafeReviewChanges(root);
  const isStaged = changes.stagedPaths.includes(normalized);
  const isUnstaged = changes.unstagedPaths.includes(normalized);
  const isUntracked = changes.untrackedPaths.includes(normalized);
  if (!isStaged && !isUnstaged && !isUntracked) {
    throw new Error("Path is not approved review evidence.");
  }
  const sections: string[] = [];
  if (isStaged) sections.push(`## Staged diff\n\n${readStagedDiff(root, normalized)}`);
  if (isUnstaged) sections.push(`## Unstaged diff\n\n${readUnstagedDiff(root, normalized)}`);
  if (isUntracked) {
    const target = await assertSafeManagedPath(root, normalized);
    if (!(await lstat(target)).isFile())
      throw new Error("Approved review path is no longer regular.");
    sections.push(`## Untracked file\n\n${await readFile(target, "utf8")}`);
  }
  return truncate(`${sections.join("\n\n")}\n`);
}
