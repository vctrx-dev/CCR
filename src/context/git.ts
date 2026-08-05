import { execFileSync } from "node:child_process";

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

const LOCAL_CONTEXT_PREFIXES = [".ccr/journal/", ".ccr/private/", ".ccr/cache/", ".ccr/tmp/"];
const DEFAULT_GIT_BUFFER_BYTES = 16 * 1024 * 1024;

function runGit(root: string, args: string[], maxBuffer = DEFAULT_GIT_BUFFER_BYTES): string {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer,
    windowsHide: true,
  });
}

/** Reads one trimmed Git metadata value without exposing process execution to feature modules. */
export function readGitValue(root: string, args: string[]): string {
  return runGit(root, args).trim();
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

/** Classifies a repo path as shared context when it lives under `.ccr/` and is not local-only state. */
export function isSharedContext(relativePath: string): boolean {
  return (
    relativePath.startsWith(".ccr/") &&
    relativePath !== ".ccr/config.local.json" &&
    !LOCAL_CONTEXT_PREFIXES.some((prefix) => relativePath.startsWith(prefix))
  );
}

/** Reads only staged path names to implement CCR's advisory pre-commit signal. */
export function readStagedContextState(root: string): StagedContextState {
  const output = runGit(root, ["diff", "--cached", "--name-only", "-z"]);
  const stagedPaths = output.split("\0").filter(Boolean);
  const hasContextChanges = stagedPaths.some(isSharedContext);
  const hasRepositoryChanges = stagedPaths.some(
    (relativePath) => !relativePath.startsWith(".ccr/"),
  );
  return {
    stagedPaths,
    hasRepositoryChanges,
    hasContextChanges,
    shouldWarn: hasRepositoryChanges && !hasContextChanges,
  };
}

/** Reads regular-file and symlink metadata from Git's index without opening worktree files. */
export function readIndexEntries(root: string): IndexEntry[] {
  return parseGitEntries(runGit(root, ["ls-files", "--stage", "-z"]), 1);
}

/** Reads HEAD tree metadata, returning empty for a repository without a first commit. */
export function readHeadEntries(root: string): IndexEntry[] {
  try {
    const output = execFileSync("git", ["ls-tree", "-r", "-z", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: DEFAULT_GIT_BUFFER_BYTES,
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    });
    return parseGitEntries(output, 2);
  } catch {
    return [];
  }
}

/** Reads one immutable blob selected by its index object ID. */
export function readGitBlob(root: string, oid: string): string {
  if (!/^[0-9a-f]{40,64}$/u.test(oid)) throw new Error("Invalid Git object ID.");
  return runGit(root, ["cat-file", "blob", oid]);
}

/** Reads the staged diff for one exact path without invoking external diff drivers. */
export function readStagedDiff(root: string, relativePath: string): string {
  return runGit(root, ["diff", "--cached", "--no-ext-diff", "--no-textconv", "--", relativePath]);
}

/** Lists path names touched by the latest five local commits without reading their content. */
export function readRecentChangedPaths(root: string): string[] {
  try {
    const output = execFileSync(
      "git",
      ["log", "-5", "--name-only", "--pretty=format:", "--no-renames"],
      {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true,
      },
    );
    return [...new Set(output.split(/\r?\n/u).filter(Boolean))];
  } catch {
    return [];
  }
}

/** Lists path names touched by the latest local commit without reading their content. */
export function readLastCommitPaths(root: string): string[] {
  try {
    const output = execFileSync(
      "git",
      ["log", "-1", "--name-only", "--pretty=format:", "--no-renames"],
      {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true,
      },
    );
    return [...new Set(output.split(/\r?\n/u).filter(Boolean))];
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
    execFileSync("git", ["check-ignore", "--no-index", "--quiet", "--", relativePath], {
      cwd: root,
      windowsHide: true,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}
