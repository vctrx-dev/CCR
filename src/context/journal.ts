import { createHash } from "node:crypto";
import { z } from "zod";
import { readManagedTextIfExists } from "./files";
import { readCurrentCommit, readGitValue, readParentCommit } from "./git";
import { ensureLocalIgnoreRules } from "./ignore";
import {
  type JournalIdentity,
  parseJournalIdentity,
  refreshJournalActivity,
} from "./journal-document";
import {
  type JournalEntry,
  type JournalResult,
  createJournalFile,
  readCompleteJournalEntry,
  readJournalEvidence,
  readSortedJournalNames,
  refreshJournalEntry,
  replaceJournalFileIfUnchanged,
  writeJournalFile,
} from "./journal-entry";
import { withJournalIdentityLock, withJournalMutationLock } from "./journal-lock";
import { readResolvedContextConfig } from "./privacy";

export type { JournalEntry, JournalResult } from "./journal-entry";
export { readCompleteJournalEntry } from "./journal-entry";
export { JOURNAL_MUTATION_LOCK_PATH, withJournalMutationLock } from "./journal-lock";

/** Metadata for a commit that already exists, supplied by post-commit or clean-HEAD workflows. */
export interface JournalDetails {
  branch: string;
  directory: string;
  commit: string;
}

const pullRequestNumberSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const pullRequestTokenSchema = z
  .string()
  .trim()
  .regex(/^PR-[1-9][0-9]*$/iu, "Pull request must use PR-<positive number>.")
  .transform((value) => Number(value.slice(3)))
  .pipe(pullRequestNumberSchema);
async function readJournalIdentity(
  root: string,
  relativePath: string,
): Promise<{ content: string; identity: JournalIdentity }> {
  const content = await readCompleteJournalEntry(root, relativePath);
  return { content, identity: parseJournalIdentity(content) };
}

/** Parses a case-insensitive pull-request token before it can select a journal directory. */
export function parsePullRequestToken(candidate: unknown): number {
  return pullRequestTokenSchema.parse(candidate);
}

function pullRequestDirectory(pullRequest: number): string {
  return `pull-request-${pullRequestNumberSchema.parse(pullRequest)}`;
}

/** Resolves the current branch and the journal directory derived from it. */
export function branchDetails(root: string): { branch: string; directory: string } {
  const branch = readGitValue(root, ["branch", "--show-current"]) || "detached";
  const branchHash = createHash("sha256").update(branch).digest("hex").slice(0, 8);
  return {
    branch,
    directory: `${branch.replace(/[^A-Za-z0-9._-]/g, "_")}-${branchHash}`,
  };
}

async function createJournalEntryWithoutLock(
  root: string,
  now: Date = new Date(),
  details?: JournalDetails,
): Promise<JournalResult> {
  const { directory } = details ?? branchDetails(root);
  const committedMetadata = details
    ? `- **Branch**: \`${details.branch}\`\n- **Commit**: \`${details.commit}\`\n`
    : `- **Base commit**: \`${readCurrentCommit(root)}\`\n`;
  if ((await readManagedTextIfExists(root, ".gitignore")) !== undefined) {
    await ensureLocalIgnoreRules(root);
  }
  return createJournalFile(root, now, directory, committedMetadata);
}

/**
 * Creates a journal skeleton behind the global mutation barrier. Omit `details` for uncommitted
 * work so the entry does not claim the current HEAD contains those changes; pass it only when the
 * represented commit already exists.
 */
export async function createJournalEntry(
  root: string,
  now: Date = new Date(),
  details?: JournalDetails,
): Promise<JournalResult> {
  return withJournalMutationLock(root, () => createJournalEntryWithoutLock(root, now, details));
}

/** Writes a complete journal while excluding uninstall's local-continuity decision. */
export async function writeCompleteJournalEntry(
  root: string,
  relativePath: string,
  content: string,
): Promise<void> {
  await withJournalMutationLock(root, () => writeJournalFile(root, relativePath, content));
}

/**
 * Returns whether any journal entry already records the given commit. Pass `directory` when the
 * caller already resolved the branch to avoid a Git round-trip.
 */
export async function journalEntryExistsForCommit(
  root: string,
  commit: string,
  directory?: string,
): Promise<boolean> {
  const resolvedDirectory = directory ?? branchDetails(root).directory;
  return (await journalEntryForCommit(root, commit, resolvedDirectory)) !== undefined;
}

async function findCommitJournalEntry(
  root: string,
  commit: string,
  directory: string,
): Promise<JournalEntry | undefined> {
  const relativeDirectory = `.ccr/journal/${directory}`;
  const names = await readSortedJournalNames(root, relativeDirectory);
  for (const name of names) {
    const path = `${relativeDirectory}/${name}`;
    const { content, identity } = await readJournalIdentity(root, path);
    if (identity.kind === "commit" && identity.commit === commit) return { path, content };
  }
  return undefined;
}

/** Returns the sole journal path already associated with a commit without creating one. */
export async function journalEntryForCommit(
  root: string,
  commit: string,
  directory: string,
): Promise<JournalResult | undefined> {
  const entry = await findCommitJournalEntry(root, commit, directory);
  return entry === undefined ? undefined : { path: entry.path };
}

async function findWorkingJournalEntry(
  root: string,
  directory: string,
  baseCommit: string,
): Promise<JournalEntry | undefined> {
  const relativeDirectory = `.ccr/journal/${directory}`;
  const names = await readSortedJournalNames(root, relativeDirectory);
  for (const name of names) {
    const path = `${relativeDirectory}/${name}`;
    const { content, identity } = await readJournalIdentity(root, path);
    if (identity.kind === "working" && identity.baseCommit === baseCommit) {
      return { path, content };
    }
  }
  return undefined;
}

async function findWorkingJournalPath(
  root: string,
  directory: string,
  baseCommit: string,
): Promise<string | undefined> {
  return (await findWorkingJournalEntry(root, directory, baseCommit))?.path;
}

/** Returns the pending journal or the current-commit journal used by a clean codebase review. */
export async function readCurrentReviewJournalEntry(
  root: string,
): Promise<JournalResult | undefined> {
  const { directory } = branchDetails(root);
  const commit = readCurrentCommit(root);
  const working = await findWorkingJournalPath(root, directory, commit);
  return working === undefined ? journalEntryForCommit(root, commit, directory) : { path: working };
}

/** Returns the pending journal whose base is the parent of an already-created commit. */
export async function journalEntryForCommitParent(
  root: string,
  details: JournalDetails,
): Promise<JournalResult | undefined> {
  const entry = await findWorkingJournalPath(
    root,
    details.directory,
    readParentCommit(root, details.commit),
  );
  return entry === undefined ? undefined : { path: entry };
}

/** Returns the branch's pending journal, creating one without branch or commit metadata if needed. */
export async function ensureWorkingJournalEntry(
  root: string,
  now: Date = new Date(),
): Promise<JournalResult> {
  const { directory } = branchDetails(root);
  const baseCommit = readCurrentCommit(root);
  return withJournalMutationLock(root, () =>
    withJournalIdentityLock(root, `working:${directory}:${baseCommit}`, async () => {
      const existing = await findWorkingJournalEntry(root, directory, baseCommit);
      if (existing === undefined) return createJournalEntryWithoutLock(root, now);
      const refreshed = await refreshJournalEntry(root, existing, now);
      return { path: refreshed.path };
    }),
  );
}

/** Attaches real commit metadata only to the pending journal that began at the commit's parent. */
export async function finalizeWorkingJournalEntry(
  root: string,
  details: JournalDetails,
  now: Date = new Date(),
): Promise<JournalResult | undefined> {
  const baseCommit = readParentCommit(root, details.commit);
  return withJournalMutationLock(root, () =>
    withJournalIdentityLock(root, `working:${details.directory}:${baseCommit}`, async () => {
      const working = await findWorkingJournalEntry(root, details.directory, baseCommit);
      if (!working) return undefined;
      const refreshedContent = refreshJournalActivity(working.content, now, working.path);
      const lineEnding = refreshedContent.includes("\r\n") ? "\r\n" : "\n";
      const workingMetadata = `- **Base commit**: \`${baseCommit}\``;
      const committedMetadata = `- **Branch**: \`${details.branch}\`${lineEnding}- **Commit**: \`${details.commit}\``;
      if (!refreshedContent.includes(workingMetadata)) {
        throw new Error(`Journal identity metadata is malformed: ${working.path}`);
      }
      const updated = refreshedContent.replace(workingMetadata, committedMetadata);
      await replaceJournalFileIfUnchanged(root, working.path, working.content, updated);
      return { path: working.path };
    }),
  );
}

/** Returns the existing current-commit journal or creates its sole review continuity entry. */
export async function ensureJournalEntryForHead(
  root: string,
  now: Date = new Date(),
): Promise<JournalResult> {
  const { branch, directory } = branchDetails(root);
  const commit = readCurrentCommit(root);
  return withJournalMutationLock(root, () =>
    withJournalIdentityLock(root, `commit:${directory}:${commit}`, async () => {
      const existing = await findCommitJournalEntry(root, commit, directory);
      if (existing) {
        const refreshed = await refreshJournalEntry(root, existing, now);
        return { path: refreshed.path };
      }
      return createJournalEntryWithoutLock(root, now, { branch, directory, commit });
    }),
  );
}

/** Returns the sole local continuity entry for one PR, creating it when first reviewed. */
export async function ensurePullRequestJournalEntry(
  root: string,
  pullRequest: number,
  now: Date = new Date(),
): Promise<JournalResult> {
  const normalized = pullRequestNumberSchema.parse(pullRequest);
  const directory = pullRequestDirectory(normalized);
  const relativeDirectory = `.ccr/journal/${directory}`;
  return withJournalMutationLock(root, () =>
    withJournalIdentityLock(root, `pull-request:${normalized}`, async () => {
      for (const name of await readSortedJournalNames(root, relativeDirectory)) {
        const path = `${relativeDirectory}/${name}`;
        const { content, identity } = await readJournalIdentity(root, path);
        if (identity.kind === "pull-request" && identity.pullRequest === normalized) {
          const refreshed = await refreshJournalEntry(root, { path, content }, now);
          return { path: refreshed.path };
        }
      }
      return createJournalFile(root, now, directory, `- **Pull request**: \`PR-${normalized}\`\n`);
    }),
  );
}

/** Reads the configured number of newest bounded entries for the current branch or one exact PR. */
export async function readRecentJournalEntries(
  root: string,
  pullRequest?: number,
): Promise<JournalEntry[]> {
  const config = await readResolvedContextConfig(root);
  const branch = pullRequest === undefined ? branchDetails(root) : undefined;
  const directory =
    pullRequest === undefined ? branch?.directory : pullRequestDirectory(pullRequest);
  if (directory === undefined) throw new Error("Journal directory could not be resolved.");
  const relativeDirectory = `.ccr/journal/${directory}`;
  const names = (await readSortedJournalNames(root, relativeDirectory)).slice(
    0,
    config.context.recentJournalEntries,
  );
  return Promise.all(
    names.map(async (name) => {
      const relativePath = `${relativeDirectory}/${name}`;
      const content = await readJournalEvidence(root, relativePath);
      const identity = parseJournalIdentity(content);
      if (identity.kind === "malformed") {
        throw new Error(`Journal identity metadata is malformed: ${relativePath}`);
      }
      if (branch && identity.kind === "commit" && identity.branch !== branch.branch) {
        throw new Error(`Journal branch metadata mismatch: ${relativePath}`);
      }
      return { path: relativePath, content };
    }),
  );
}
