import type { BoundedGitText } from "./git-process";
import { hashGitWorktreePaths, runBoundedGit, runGit, runGitMetadata } from "./git-process";

export type { BoundedGitText } from "./git-process";

/**
 * Shared read-only Git boundary for context features. Add metadata or index operations here so
 * parsing stays consistent; callers exposing content must use the broker, not working-tree reads.
 */

export interface IndexEntry {
  mode: string;
  oid: string;
  path: string;
}

export interface StagedContextState {
  stagedPaths: string[];
  hasRepositoryChanges: boolean;
  hasContextChanges: boolean;
  shouldWarn: boolean;
}

export interface ContextClassification {
  repositoryChanges: string[];
  hasRepositoryChanges: boolean;
  hasContextChanges: boolean;
  shouldWarn: boolean;
}

const LOCAL_CONTEXT_PREFIXES = [".ccr/journal/", ".ccr/private/", ".ccr/cache/", ".ccr/tmp/"];
const GIT_NATIVE_BINARY_DIFF_PATTERN = /^Binary files [^\r\n]+ differ\r?$/mu;

function classifyBoundedGitDiff(result: BoundedGitText): BoundedGitText {
  if (result.isBinary || !GIT_NATIVE_BINARY_DIFF_PATTERN.test(result.content)) return result;
  return { content: "", isBinary: true, isTruncated: result.isTruncated };
}

/** Reads one trimmed Git metadata value without exposing process execution to feature modules. */
export function readGitValue(root: string, args: string[]): string {
  return runGit(root, args).trim();
}

function readCommitOrUnborn(root: string, revision: string): string {
  try {
    return runGit(root, ["rev-parse", "--verify", "--quiet", revision], 200, true).trim();
  } catch {
    return "unborn";
  }
}

/** Resolves HEAD, returning the shared `unborn` sentinel before the repository's first commit. */
export function readCurrentCommit(root: string): string {
  return readCommitOrUnborn(root, "HEAD");
}

/** Resolves a commit's first parent, returning `unborn` for a root or missing commit. */
export function readParentCommit(root: string, commit: string): string {
  return readCommitOrUnborn(root, `${commit}^`);
}

function parseGitEntries(output: string, oidIndex: number): IndexEntry[] {
  return output
    .split("\0")
    .filter(Boolean)
    .map((record) => {
      const tabIndex = record.indexOf("\t");
      const fields = record.slice(0, tabIndex).split(" ");
      return {
        mode: fields[0] ?? "",
        oid: fields[oidIndex] ?? "",
        path: record.slice(tabIndex + 1),
      };
    });
}

function parseGitPaths(output: string): string[] {
  return [...new Set(output.split("\0").filter(Boolean))];
}

function isLocalContext(relativePath: string): boolean {
  return (
    relativePath === ".ccr/config.local.json" ||
    LOCAL_CONTEXT_PREFIXES.some((prefix) => relativePath.startsWith(prefix))
  );
}

/** Classifies a repo path as shared context when it lives under `.ccr/` and is not local-only state. */
export function isSharedContext(relativePath: string): boolean {
  return (
    relativePath.startsWith(".ccr/") &&
    relativePath !== ".ccr/index.md" &&
    !isLocalContext(relativePath)
  );
}

/** Returns whether tracked, staged, or untracked work remains without exposing path contents. */
export function hasWorkingTreeChanges(root: string): boolean {
  const paths = [
    ...parseGitPaths(runGit(root, ["diff", "--cached", "--name-only", "-z"])),
    ...readUnstagedPaths(root),
    ...readUntrackedPaths(root),
  ];
  return paths.some((relativePath) => !isLocalContext(relativePath));
}

/**
 * Separates changed paths into repository work and shared context, deriving the advisory warn
 * decision. Shared by the pre-commit and post-commit checks so the two signals cannot drift.
 */
export function classifyContextChanges(paths: string[]): ContextClassification {
  const repositoryChanges = paths.filter((relativePath) => !relativePath.startsWith(".ccr/"));
  const hasRepositoryChanges = repositoryChanges.length > 0;
  const hasContextChanges = paths.some(isSharedContext);
  return {
    repositoryChanges,
    hasRepositoryChanges,
    hasContextChanges,
    shouldWarn: hasRepositoryChanges && !hasContextChanges,
  };
}

/** Reads only staged path names to implement CCR's advisory pre-commit signal. */
export function readStagedContextState(root: string): StagedContextState {
  const output = runGit(root, ["diff", "--cached", "--name-only", "-z"]);
  const stagedPaths = parseGitPaths(output);
  const { hasRepositoryChanges, hasContextChanges, shouldWarn } =
    classifyContextChanges(stagedPaths);
  return { stagedPaths, hasRepositoryChanges, hasContextChanges, shouldWarn };
}

/** Lists tracked paths with unstaged worktree changes without reading file content. */
export function readUnstagedPaths(root: string): string[] {
  return parseGitPaths(runGit(root, ["diff", "--name-only", "-z"]));
}

/** Lists untracked, non-ignored paths without reading file content. */
export function readUntrackedPaths(root: string): string[] {
  return parseGitPaths(runGit(root, ["ls-files", "--others", "--exclude-standard", "-z"]));
}

/** Fingerprints only caller-approved worktree paths without exposing their content to callers. */
function fingerprintWorktreePaths(
  root: string,
  approvedPaths: string[],
  shouldApplyFilters: boolean,
): Map<string, string> {
  const paths = [...new Set(approvedPaths)];
  if (paths.length > 5_000) {
    throw new Error("Working tree has too many paths to fingerprint safely.");
  }
  return hashGitWorktreePaths(root, paths, shouldApplyFilters);
}

/** Fingerprints approved paths after Git clean filters for comparison with index blob IDs. */
export function readFilteredWorktreePathFingerprints(
  root: string,
  approvedPaths: string[],
): Map<string, string> {
  return fingerprintWorktreePaths(root, approvedPaths, true);
}

/** Fingerprints every visible dirty or untracked path for automatic context-update validation. */
export function readWorkingTreeFingerprints(root: string): Map<string, string> {
  return fingerprintWorktreePaths(
    root,
    [...readUnstagedPaths(root), ...readUntrackedPaths(root)],
    false,
  );
}

/** Reads regular-file and symlink metadata from Git's index without opening worktree files. */
export function readIndexEntries(root: string): IndexEntry[] {
  return parseGitEntries(runGit(root, ["ls-files", "--stage", "-z"]), 1);
}

/** Reads independent inventories concurrently with exact NUL-delimited paths and bounded output. */
export async function readLiveGitInventory(root: string) {
  const [head, index, staged, unstaged, untracked] = await Promise.all([
    runGitMetadata(root, ["ls-tree", "-r", "-z", "HEAD"]).catch(() => ""),
    runGitMetadata(root, ["ls-files", "--stage", "-z"]),
    runGitMetadata(root, ["diff", "--cached", "--name-only", "-z"]),
    runGitMetadata(root, ["diff", "--name-only", "-z"]),
    runGitMetadata(root, ["ls-files", "--others", "--exclude-standard", "-z"]),
  ]);
  return {
    headEntries: parseGitEntries(head, 2),
    entries: parseGitEntries(index, 1),
    stagedPaths: parseGitPaths(staged),
    unstagedPaths: parseGitPaths(unstaged),
    untrackedPaths: parseGitPaths(untracked),
  };
}

/** Reads one commit tree's regular-file and symlink metadata without opening worktree files. */
export function readCommitEntries(root: string, commit: string): IndexEntry[] {
  return parseGitEntries(runGit(root, ["ls-tree", "-r", "-z", commit]), 2);
}

/** Lists paths changed by one commit against its first parent, or the empty tree for a root commit. */
export function readCommitChangedPaths(root: string, commit: string): string[] {
  return parseGitPaths(
    runGit(root, [
      "diff-tree",
      "--root",
      "--diff-merges=first-parent",
      "--no-commit-id",
      "--name-only",
      "-r",
      "-z",
      "--no-renames",
      commit,
    ]),
  );
}

/** Reads a bounded immutable blob prefix and identifies non-text content. */
export function readBoundedGitBlob(
  root: string,
  oid: string,
  maximumCharacters: number,
): Promise<BoundedGitText> {
  if (!/^[0-9a-f]{40,64}$/u.test(oid)) throw new Error("Invalid Git object ID.");
  return runBoundedGit(root, ["cat-file", "blob", oid], maximumCharacters);
}

/** Streams a bounded staged diff prefix without invoking external diff drivers. */
export async function readBoundedStagedDiff(
  root: string,
  relativePath: string,
  maximumCharacters: number,
): Promise<BoundedGitText> {
  return classifyBoundedGitDiff(
    await runBoundedGit(
      root,
      ["diff", "--cached", "--no-ext-diff", "--no-textconv", "--", relativePath],
      maximumCharacters,
    ),
  );
}

/** Streams a bounded diff of one path against the commit's first parent, or the empty tree. */
export async function readBoundedCommitDiff(
  root: string,
  commit: string,
  relativePath: string,
  maximumCharacters: number,
): Promise<BoundedGitText> {
  return classifyBoundedGitDiff(
    await runBoundedGit(
      root,
      [
        "diff-tree",
        "--root",
        "--diff-merges=first-parent",
        "--no-commit-id",
        "-p",
        "-r",
        "--no-renames",
        "--no-ext-diff",
        "--no-textconv",
        "--no-color",
        commit,
        "--",
        relativePath,
      ],
      maximumCharacters,
    ),
  );
}

/** Streams a bounded unstaged diff prefix without invoking external diff drivers. */
export async function readBoundedUnstagedDiff(
  root: string,
  relativePath: string,
  maximumCharacters: number,
): Promise<BoundedGitText> {
  return classifyBoundedGitDiff(
    await runBoundedGit(
      root,
      ["diff", "--no-ext-diff", "--no-textconv", "--", relativePath],
      maximumCharacters,
    ),
  );
}

/** Lists path names touched by the latest `count` local commits without reading their content. */
export function readChangedPaths(root: string, count: number): string[] {
  try {
    const output = runGit(
      root,
      [
        "log",
        `-${count}`,
        "--name-only",
        "-z",
        "--pretty=format:",
        "--no-renames",
        "--diff-merges=first-parent",
      ],
      1024 * 1024,
      true,
    );
    return parseGitPaths(output);
  } catch {
    return [];
  }
}

/** Resolves the Git worktree root without modifying repository configuration. */
export function findRepositoryRoot(cwd: string): string {
  return readGitValue(cwd, ["rev-parse", "--show-toplevel"]);
}

/** Checks whether Git would ignore a generated path, including paths not created yet. */
export function isGitIgnored(root: string, relativePath: string): boolean {
  try {
    runGit(root, ["check-ignore", "--no-index", "--quiet", "--", relativePath], 200, true);
    return true;
  } catch {
    return false;
  }
}
