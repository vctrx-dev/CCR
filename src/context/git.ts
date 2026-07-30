import { execFileSync } from "node:child_process";

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

function isSharedContext(relativePath: string): boolean {
  return (
    relativePath.startsWith(".ccr/") &&
    relativePath !== ".ccr/config.local.json" &&
    !LOCAL_CONTEXT_PREFIXES.some((prefix) => relativePath.startsWith(prefix))
  );
}

/** Reads only staged path names to implement CCR's advisory pre-commit signal. */
export function readStagedContextState(root: string): StagedContextState {
  const output = execFileSync("git", ["diff", "--cached", "--name-only", "-z"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
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
  const output = execFileSync("git", ["ls-files", "--stage", "-z"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  return output
    .split("\0")
    .filter(Boolean)
    .map((record) => {
      const tabIndex = record.indexOf("\t");
      const [mode = "", oid = ""] = record.slice(0, tabIndex).split(" ");
      return { mode, oid, path: record.slice(tabIndex + 1) };
    });
}

/** Reads HEAD tree metadata, returning empty for a repository without a first commit. */
export function readHeadEntries(root: string): IndexEntry[] {
  try {
    const output = execFileSync("git", ["ls-tree", "-r", "-z", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    });
    return output
      .split("\0")
      .filter(Boolean)
      .map((record) => {
        const tabIndex = record.indexOf("\t");
        const [mode = "", , oid = ""] = record.slice(0, tabIndex).split(" ");
        return { mode, oid, path: record.slice(tabIndex + 1) };
      });
  } catch {
    return [];
  }
}

/** Reads one immutable blob selected by its index object ID. */
export function readGitBlob(root: string, oid: string): string {
  if (!/^[0-9a-f]{40,64}$/u.test(oid)) throw new Error("Invalid Git object ID.");
  return execFileSync("git", ["cat-file", "blob", oid], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
}

/** Reads the staged diff for one exact path without invoking external diff drivers. */
export function readStagedDiff(root: string, relativePath: string): string {
  return execFileSync(
    "git",
    ["diff", "--cached", "--no-ext-diff", "--no-textconv", "--", relativePath],
    {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    },
  );
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

/** Resolves the Git worktree root without modifying repository configuration. */
export function findRepositoryRoot(cwd: string): string {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  }).trim();
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
