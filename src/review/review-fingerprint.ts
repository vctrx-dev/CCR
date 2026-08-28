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
import { type ReviewJournalTarget, readReviewJournalEntriesForReview } from "../context/journal";
import { readResolvedContextConfig, readSafeStagedPaths } from "../context/privacy";
import { hasSafeReviewChanges, listSafeReviewChanges } from "./evidence";

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
  inputContextFingerprint: string;
  pathCount: number;
}

export interface ReviewContextState {
  contextFingerprint: string;
  inputContextFingerprint: string;
}

function hashReviewContext(
  config: Awaited<ReturnType<typeof readResolvedContextConfig>>,
  contextEntries: Array<[string, "missing"] | [string, "present", string]>,
  journalEntries: Array<readonly [string, string]>,
): string {
  const canonical = JSON.stringify({ config, contextEntries, journalEntries });
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

/**
 * Computes a complete review-input hash and a continuity-safe hash from one repository-wide journal
 * snapshot. The latter excludes the active write target before applying the configured count;
 * `pullRequest` identifies only that target and never scopes journal recency.
 */
async function computeReviewContextStateForTarget(
  root: string,
  target: ReviewJournalTarget,
): Promise<ReviewContextState> {
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
  const journals = await readReviewJournalEntriesForReview(
    root,
    config.context.recentJournalEntries,
    target,
  );
  const canonicalEntries = (entries: typeof journals.inputEntries) =>
    entries
      .map(({ path: journalPath, content }) => [journalPath, content] as const)
      .sort(([left], [right]) => left.localeCompare(right));
  return {
    contextFingerprint: hashReviewContext(
      config,
      contextEntries,
      canonicalEntries(journals.continuityEntries),
    ),
    inputContextFingerprint: hashReviewContext(
      config,
      contextEntries,
      canonicalEntries(journals.inputEntries),
    ),
  };
}

/**
 * Fingerprints every bounded review-context input and returns a separate continuity-safe hash.
 * An optional PR identifies only its active journal; local targets follow the approved live state.
 */
export async function computeReviewContextState(
  root: string,
  pullRequest?: number,
): Promise<ReviewContextState> {
  const target: ReviewJournalTarget =
    pullRequest === undefined
      ? { kind: hasSafeReviewChanges(await listSafeReviewChanges(root)) ? "working" : "head" }
      : { kind: "pull-request", pullRequest };
  return computeReviewContextStateForTarget(root, target);
}

/** Returns the continuity-stable context hash retained for existing API consumers. */
export async function computeReviewContextFingerprint(
  root: string,
  pullRequest?: number,
): Promise<string> {
  return (await computeReviewContextState(root, pullRequest)).contextFingerprint;
}

async function fingerprintState(
  root: string,
  baseCommit: string,
  entries: Array<[string, string, string]>,
  target: ReviewJournalTarget,
): Promise<ReviewState> {
  const canonical = JSON.stringify({
    baseCommit,
    entries: entries.sort(([a], [b]) => a.localeCompare(b)),
  });
  const context = await computeReviewContextStateForTarget(root, target);
  return {
    baseCommit,
    fingerprint: `sha256:${createHash("sha256").update(canonical).digest("hex")}`,
    ...context,
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
  return fingerprintState(root, readCurrentCommit(root), entries, {
    kind: hasSafeReviewChanges(changes) ? "working" : "head",
  });
}

/** Fingerprints the exact privacy-approved commit candidate currently in Git's index. */
export async function computeStagedReviewState(root: string): Promise<ReviewState> {
  const [staged, changes] = await Promise.all([
    readSafeStagedPaths(root),
    listSafeReviewChanges(root),
  ]);
  const paths = staged.included.filter(isReviewTrackedPath);
  const index = new Map(readIndexEntries(root).map((entry) => [entry.path, entry]));
  return fingerprintState(
    root,
    readCurrentCommit(root),
    paths.map((relativePath) => {
      const entry = index.get(relativePath);
      return [relativePath, entry?.mode ?? "missing", entry?.oid ?? "missing"];
    }),
    { kind: hasSafeReviewChanges(changes) ? "working" : "head" },
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
    { kind: "head" },
  );
}
