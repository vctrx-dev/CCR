import { createHash } from "node:crypto";
import { approveGitInventory } from "../context/approved-git-inventory";
import {
  assertSafeManagedPath,
  readBoundedUtf8TextIfExists,
  readRegularFileGitMode,
} from "../context/files";
import {
  readCommitChangedPaths,
  readCommitEntries,
  readCurrentCommit,
  readFilteredWorktreePathFingerprints,
  readGitValue,
  readIndexEntries,
  readParentCommit,
} from "../context/git";
import { readCurrentReviewJournalEntry, readRecentJournalEntries } from "../context/journal";
import { readResolvedContextConfig, readSafeStagedPaths } from "../context/privacy";
import { listSafeReviewChanges } from "./evidence";

/**
 * Deterministic review fingerprinting. These functions bind privacy-approved final content and
 * bounded context to a base commit without reading or mutating review continuity metadata.
 */

const REVIEW_CONTEXT_PATHS = [
  ".ccr/project.md",
  ".ccr/stakeholders.md",
  ".ccr/decisions.md",
] as const;
const MAX_REVIEW_CONTEXT_CHARACTERS = 10_000;

export interface ReviewState {
  baseCommit: string;
  fingerprint: string;
  contextFingerprint: string;
  pathCount: number;
}

/**
 * Fingerprints bounded shared context, resolved configuration, and the recent journals supplied to
 * a review. The active branch continuity target is excluded because review recording mutates it and
 * validates that mutation separately with compare-and-swap semantics.
 */
export async function computeReviewContextFingerprint(
  root: string,
  pullRequest?: number,
): Promise<string> {
  const config = await readResolvedContextConfig(root);
  const contextEntries = await Promise.all(
    REVIEW_CONTEXT_PATHS.map(
      async (relativePath): Promise<[string, "missing"] | [string, "present", string]> => {
        const bounded = await readBoundedUtf8TextIfExists(
          await assertSafeManagedPath(root, relativePath),
          MAX_REVIEW_CONTEXT_CHARACTERS,
        );
        if (bounded === undefined) return [relativePath, "missing"];
        if (bounded.isTruncated) {
          throw new Error(
            `Review context exceeds ${MAX_REVIEW_CONTEXT_CHARACTERS} characters: ${relativePath}`,
          );
        }
        if (bounded.isBinary) {
          throw new Error(`Review context is not valid UTF-8 text: ${relativePath}`);
        }
        return [relativePath, "present", bounded.content];
      },
    ),
  );
  const activeJournal =
    pullRequest === undefined ? await readCurrentReviewJournalEntry(root) : undefined;
  const journalEntries = (await readRecentJournalEntries(root, pullRequest))
    .filter(({ path: journalPath }) => journalPath !== activeJournal?.path)
    .map(({ path: journalPath, content }) => [journalPath, content] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  const canonical = JSON.stringify({ config, contextEntries, journalEntries });
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

async function fingerprintState(
  root: string,
  baseCommit: string,
  entries: Array<[string, string, string]>,
): Promise<ReviewState> {
  const canonical = JSON.stringify({
    baseCommit,
    entries: entries.sort(([a], [b]) => a.localeCompare(b)),
  });
  return {
    baseCommit,
    fingerprint: `sha256:${createHash("sha256").update(canonical).digest("hex")}`,
    contextFingerprint: await computeReviewContextFingerprint(root),
    pathCount: entries.length,
  };
}

function isReviewTrackedPath(relativePath: string): boolean {
  return !relativePath.startsWith(".ccr/");
}

/** Fingerprints the final approved content represented by all current live changes. */
export async function computeWorkingReviewState(root: string): Promise<ReviewState> {
  const changes = await listSafeReviewChanges(root);
  const paths = [
    ...new Set([...changes.stagedPaths, ...changes.unstagedPaths, ...changes.untrackedPaths]),
  ].filter(isReviewTrackedPath);
  const worktree = readFilteredWorktreePathFingerprints(root, paths);
  const index = new Map(readIndexEntries(root).map((entry) => [entry.path, entry]));
  const worktreePaths = new Set([...changes.unstagedPaths, ...changes.untrackedPaths]);
  const isFileModeTrusted = (() => {
    try {
      return readGitValue(root, ["config", "--bool", "core.filemode"]) !== "false";
    } catch {
      return true;
    }
  })();
  const entries = await Promise.all(
    paths.map(async (relativePath): Promise<[string, string, string]> => {
      const oid = worktree.get(relativePath) ?? index.get(relativePath)?.oid ?? "missing";
      if (oid === "missing") return [relativePath, "missing", oid];
      if (!worktreePaths.has(relativePath)) {
        return [relativePath, index.get(relativePath)?.mode ?? "100644", oid];
      }
      if (!isFileModeTrusted) {
        return [relativePath, index.get(relativePath)?.mode ?? "100644", oid];
      }
      const mode = await readRegularFileGitMode(root, relativePath);
      return [relativePath, mode ?? "missing", oid];
    }),
  );
  return fingerprintState(root, readCurrentCommit(root), entries);
}

/** Fingerprints the exact privacy-approved commit candidate currently in Git's index. */
export async function computeStagedReviewState(root: string): Promise<ReviewState> {
  const paths = (await readSafeStagedPaths(root)).included.filter(isReviewTrackedPath);
  const index = new Map(readIndexEntries(root).map((entry) => [entry.path, entry]));
  return fingerprintState(
    root,
    readCurrentCommit(root),
    paths.map((relativePath) => {
      const entry = index.get(relativePath);
      return [relativePath, entry?.mode ?? "missing", entry?.oid ?? "missing"];
    }),
  );
}

/** Fingerprints one committed change using immutable tree object IDs and the same privacy policy. */
export async function computeCommittedReviewState(
  root: string,
  commit: string,
): Promise<ReviewState> {
  const config = await readResolvedContextConfig(root);
  const baseCommit = readParentCommit(root, commit);
  const commitEntries = readCommitEntries(root, commit);
  const baseEntries = baseCommit === "unborn" ? [] : readCommitEntries(root, baseCommit);
  const approved = approveGitInventory({
    baselineEntries: baseEntries,
    candidatePaths: readCommitChangedPaths(root, commit),
    currentEntries: commitEntries,
    excludedPatterns: config.privacy.excludedPaths,
  });
  const paths = approved.included.filter(isReviewTrackedPath);
  return fingerprintState(
    root,
    baseCommit,
    paths.map((relativePath) => {
      const entry = approved.entriesByPath.get(relativePath);
      return [relativePath, entry?.mode ?? "missing", entry?.oid ?? "missing"];
    }),
  );
}
