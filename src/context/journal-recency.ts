import { createHash } from "node:crypto";
import { parseJournalIdentity, readJournalActivity } from "./journal-document";
import {
  type JournalEntry,
  formatJournalEvidence,
  readCompleteJournalEntry,
  readJournalPaths,
} from "./journal-entry";
import { withJournalMutationLock } from "./journal-lock";
import { readResolvedContextConfig } from "./privacy";

/**
 * Repository-wide journal recency selection. Keep activity validation and ordering here so journal
 * identity workflows can remain branch/PR-specific without accidentally scoping continuity reads.
 */

interface JournalActivityCandidate {
  contentFingerprint: string;
  path: string;
  started: string;
  updated: string;
}

export interface ReviewJournalEntries {
  continuityEntries: JournalEntry[];
  inputEntries: JournalEntry[];
}

function compareJournalActivity(
  left: JournalActivityCandidate,
  right: JournalActivityCandidate,
): number {
  const updatedOrder = right.updated.localeCompare(left.updated);
  if (updatedOrder !== 0) return updatedOrder;
  const startedOrder = right.started.localeCompare(left.started);
  return startedOrder !== 0 ? startedOrder : left.path.localeCompare(right.path);
}

async function readJournalActivityCandidates(root: string): Promise<JournalActivityCandidate[]> {
  const candidates: JournalActivityCandidate[] = [];
  for (const relativePath of await readJournalPaths(root)) {
    const content = await readCompleteJournalEntry(root, relativePath);
    candidates.push({
      contentFingerprint: createHash("sha256").update(content).digest("hex"),
      path: relativePath,
      ...readJournalActivity(content, relativePath),
    });
  }
  return candidates.sort(compareJournalActivity);
}

function hasSameJournalSnapshot(
  left: JournalActivityCandidate[],
  right: JournalActivityCandidate[],
): boolean {
  return (
    left.length === right.length &&
    left.every((candidate, index) => {
      const other = right[index];
      return (
        other !== undefined &&
        candidate.path === other.path &&
        candidate.started === other.started &&
        candidate.updated === other.updated &&
        candidate.contentFingerprint === other.contentFingerprint
      );
    })
  );
}

async function formatSelectedEntries(
  root: string,
  selected: JournalActivityCandidate[],
): Promise<JournalEntry[]> {
  return Promise.all(
    selected.map(async (selectedActivity) => {
      const relativePath = selectedActivity.path;
      const completeContent = await readCompleteJournalEntry(root, relativePath);
      const currentActivity = readJournalActivity(completeContent, relativePath);
      if (
        createHash("sha256").update(completeContent).digest("hex") !==
          selectedActivity.contentFingerprint ||
        currentActivity.started !== selectedActivity.started ||
        currentActivity.updated !== selectedActivity.updated
      ) {
        throw new Error(`Journal changed during recency selection: ${relativePath}`);
      }
      if (parseJournalIdentity(completeContent).kind === "malformed") {
        throw new Error(`Journal identity metadata is malformed: ${relativePath}`);
      }
      return { path: relativePath, content: formatJournalEvidence(completeContent) };
    }),
  );
}

async function readReviewJournalEntriesLocked(
  root: string,
  recentJournalEntries: number,
  excludedContinuityPath?: string,
): Promise<ReviewJournalEntries> {
  const candidates = await readJournalActivityCandidates(root);
  const inputCandidates = candidates.slice(0, recentJournalEntries);
  const continuityCandidates = candidates
    .filter(({ path }) => path !== excludedContinuityPath)
    .slice(0, recentJournalEntries);
  const uniqueCandidates = [
    ...new Map(
      [...inputCandidates, ...continuityCandidates].map((candidate) => [candidate.path, candidate]),
    ).values(),
  ];
  const formatted = await formatSelectedEntries(root, uniqueCandidates);
  if (!hasSameJournalSnapshot(candidates, await readJournalActivityCandidates(root))) {
    throw new Error("Journal set changed during recency selection; retry the operation.");
  }
  const formattedByPath = new Map(formatted.map((entry) => [entry.path, entry]));
  const entriesFor = (selected: JournalActivityCandidate[]): JournalEntry[] =>
    selected.map(({ path }) => {
      const entry = formattedByPath.get(path);
      if (entry === undefined) throw new Error(`Selected journal was not formatted: ${path}`);
      return entry;
    });
  return {
    continuityEntries: entriesFor(continuityCandidates),
    inputEntries: entriesFor(inputCandidates),
  };
}

/** Reads both review journal sets while the caller holds the global journal mutation barrier. */
export async function readReviewJournalEntriesWhileLocked(
  root: string,
  recentJournalEntries: number,
  excludedContinuityPath?: string,
): Promise<ReviewJournalEntries> {
  return readReviewJournalEntriesLocked(root, recentJournalEntries, excludedContinuityPath);
}

/**
 * Reads the configured number of most recently updated journals across repository-local history.
 * Selection holds the shared journal barrier so the global ordering represents one stable snapshot.
 */
export async function readRecentJournalEntries(root: string): Promise<JournalEntry[]> {
  const config = await readResolvedContextConfig(root);
  return withJournalMutationLock(
    root,
    async () =>
      (await readReviewJournalEntriesLocked(root, config.context.recentJournalEntries))
        .inputEntries,
  );
}
