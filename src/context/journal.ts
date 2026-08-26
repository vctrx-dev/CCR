import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { z } from "zod";
import { truncateEvidence } from "./evidence-format";
import {
  assertSafeManagedPath,
  isFileNotFound,
  readBoundedTextIfExists,
  readManagedTextIfExists,
  writeManagedText,
} from "./files";
import { readGitValue } from "./git";
import { readResolvedContextConfig } from "./privacy";

export interface JournalResult {
  path: string;
}

export interface JournalEntry extends JournalResult {
  content: string;
}

/** Metadata for a commit that already exists, supplied by post-commit or clean-HEAD workflows. */
export interface JournalDetails {
  branch: string;
  directory: string;
  commit: string;
}

const JOURNAL_FILENAME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z(?:\.\d+)?\.md$/u;
const MAX_JOURNAL_EVIDENCE_CHARACTERS = 4_000;
const MAX_JOURNAL_FILE_CHARACTERS = 64_000;
const pullRequestNumberSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const pullRequestTokenSchema = z
  .string()
  .trim()
  .regex(/^PR-[1-9][0-9]*$/iu, "Pull request must use PR-<positive number>.")
  .transform((value) => Number(value.slice(3)))
  .pipe(pullRequestNumberSchema);

/** Parses a case-insensitive pull-request token before it can select a journal directory. */
export function parsePullRequestToken(candidate: unknown): number {
  return pullRequestTokenSchema.parse(candidate);
}

function pullRequestDirectory(pullRequest: number): string {
  return `pull-request-${pullRequestNumberSchema.parse(pullRequest)}`;
}

/** Resolves the current branch (falling back to "detached") and the journal directory derived from it. */
export function branchDetails(root: string): { branch: string; directory: string } {
  const branch = readGitValue(root, ["branch", "--show-current"]) || "detached";
  const branchHash = createHash("sha256").update(branch).digest("hex").slice(0, 8);
  return {
    branch,
    directory: `${branch.replace(/[^A-Za-z0-9._-]/g, "_")}-${branchHash}`,
  };
}

/**
 * Returns the first free journal path for a second-resolution timestamp. Appends a numeric
 * suffix (`.1.md`, `.2.md`, ...) when the base path already exists so same-second entries do
 * not overwrite one another; the base path is returned unchanged when it is free.
 */
async function freeJournalPath(
  root: string,
  relativeDirectory: string,
  timestamp: string,
): Promise<string> {
  const base = `${relativeDirectory}/${timestamp}`;
  const relativePath = `${base}.md`;
  if ((await readManagedTextIfExists(root, relativePath)) === undefined) return relativePath;
  for (let index = 1; ; index += 1) {
    const candidate = `${base}.${index}.md`;
    if ((await readManagedTextIfExists(root, candidate)) === undefined) return candidate;
  }
}

async function readJournalNames(root: string, relativeDirectory: string): Promise<string[]> {
  try {
    return (
      await readdir(await assertSafeManagedPath(root, relativeDirectory), { withFileTypes: true })
    )
      .filter((entry) => entry.isFile() && JOURNAL_FILENAME_PATTERN.test(entry.name))
      .map((entry) => entry.name);
  } catch (error: unknown) {
    if (isFileNotFound(error)) return [];
    throw error;
  }
}

async function readJournalEvidence(root: string, relativePath: string): Promise<string> {
  const bounded = await readBoundedTextIfExists(
    await assertSafeManagedPath(root, relativePath),
    MAX_JOURNAL_EVIDENCE_CHARACTERS,
  );
  if (bounded === undefined) throw new Error(`Journal entry disappeared: ${relativePath}`);
  return truncateEvidence(bounded.content, {
    isTruncated: bounded.isTruncated,
    marker: `[CCR journal truncated at ${MAX_JOURNAL_EVIDENCE_CHARACTERS} characters]`,
    maximumCharacters: MAX_JOURNAL_EVIDENCE_CHARACTERS,
  });
}

async function readCompleteJournal(root: string, relativePath: string): Promise<string> {
  const bounded = await readBoundedTextIfExists(
    await assertSafeManagedPath(root, relativePath),
    MAX_JOURNAL_FILE_CHARACTERS,
  );
  if (bounded === undefined) throw new Error(`Journal entry disappeared: ${relativePath}`);
  if (bounded.isTruncated) {
    throw new Error(
      `Journal entry exceeds ${MAX_JOURNAL_FILE_CHARACTERS} characters: ${relativePath}`,
    );
  }
  return bounded.content;
}

async function createJournalFile(
  root: string,
  now: Date,
  directory: string,
  identityMetadata = "",
): Promise<JournalResult> {
  const isoTimestamp = now.toISOString().replace(/\.\d{3}Z$/, "Z");
  const timestamp = isoTimestamp.replaceAll(":", "-");
  const relativePath = await freeJournalPath(root, `.ccr/journal/${directory}`, timestamp);
  await writeManagedText(
    root,
    relativePath,
    `# CCR Journal\n\n- **Timestamp**: ${isoTimestamp}\n${identityMetadata}\n## Summary\n\nNeeds concise completion.\n\n## Findings and outcomes\n\n- Addressed: none.\n- Deferred: none.\n- Questioned: none.\n- Rejected: none.\n`,
  );
  return { path: relativePath };
}

function currentCommit(root: string): string {
  try {
    return readGitValue(root, ["rev-parse", "--verify", "--quiet", "HEAD"]);
  } catch {
    return "unborn";
  }
}

function parentCommit(root: string, commit: string): string {
  try {
    return readGitValue(root, ["rev-parse", "--verify", "--quiet", `${commit}^`]);
  } catch {
    return "unborn";
  }
}

/**
 * Creates a journal skeleton. Omit `details` for uncommitted work so the entry does not claim the
 * current HEAD contains those changes; pass it only when the represented commit already exists.
 */
export async function createJournalEntry(
  root: string,
  now: Date = new Date(),
  details?: JournalDetails,
): Promise<JournalResult> {
  const { directory } = details ?? branchDetails(root);
  const committedMetadata = details
    ? `- **Branch**: \`${details.branch}\`\n- **Commit**: \`${details.commit}\`\n`
    : `- **Base commit**: \`${currentCommit(root)}\`\n`;
  return createJournalFile(root, now, directory, committedMetadata);
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

/** Returns the sole journal path already associated with a commit without creating one. */
export async function journalEntryForCommit(
  root: string,
  commit: string,
  directory: string,
): Promise<JournalResult | undefined> {
  const relativeDirectory = `.ccr/journal/${directory}`;
  const names = (await readJournalNames(root, relativeDirectory)).sort().reverse();
  for (const name of names) {
    const content = await readJournalEvidence(root, `${relativeDirectory}/${name}`);
    if (content.includes(`- **Commit**: \`${commit}\``)) {
      return { path: `${relativeDirectory}/${name}` };
    }
  }
  return undefined;
}

async function findWorkingJournalEntry(
  root: string,
  directory: string,
  baseCommit: string,
): Promise<JournalEntry | undefined> {
  const relativeDirectory = `.ccr/journal/${directory}`;
  const names = (await readJournalNames(root, relativeDirectory)).sort().reverse();
  for (const name of names) {
    const relativePath = `${relativeDirectory}/${name}`;
    const evidence = await readJournalEvidence(root, relativePath);
    if (evidence.includes("- **Commit**:")) continue;
    if (!evidence.includes(`- **Base commit**: \`${baseCommit}\``)) continue;
    const content = await readCompleteJournal(root, relativePath);
    return { path: relativePath, content };
  }
  return undefined;
}

/** Returns the branch's pending journal, creating one without branch or commit metadata if needed. */
export async function ensureWorkingJournalEntry(
  root: string,
  now: Date = new Date(),
): Promise<JournalResult> {
  const { directory } = branchDetails(root);
  const existing = await findWorkingJournalEntry(root, directory, currentCommit(root));
  return existing ? { path: existing.path } : createJournalEntry(root, now);
}

/** Attaches real commit metadata only to the pending journal that began at the commit's parent. */
export async function finalizeWorkingJournalEntry(
  root: string,
  details: JournalDetails,
): Promise<JournalResult | undefined> {
  const working = await findWorkingJournalEntry(
    root,
    details.directory,
    parentCommit(root, details.commit),
  );
  if (!working) return undefined;
  const lineEnding = working.content.includes("\r\n") ? "\r\n" : "\n";
  const timestampStart = working.content.indexOf("- **Timestamp**:");
  const timestampEnd = working.content.indexOf(`${lineEnding}${lineEnding}`, timestampStart);
  if (timestampStart < 0 || timestampEnd < 0) {
    throw new Error(`Journal timestamp metadata is malformed: ${working.path}`);
  }
  const committedMetadata = `${lineEnding}- **Branch**: \`${details.branch}\`${lineEnding}- **Commit**: \`${details.commit}\``;
  const updated = `${working.content.slice(0, timestampEnd)}${committedMetadata}${working.content.slice(timestampEnd)}`;
  await writeManagedText(root, working.path, updated);
  return { path: working.path };
}

/** Returns the existing current-commit journal or creates its sole review continuity entry. */
export async function ensureJournalEntryForHead(
  root: string,
  now: Date = new Date(),
): Promise<JournalResult> {
  const { branch, directory } = branchDetails(root);
  const commit = currentCommit(root);
  const existing = await journalEntryForCommit(root, commit, directory);
  if (existing) return existing;
  return createJournalEntry(root, now, { branch, directory, commit });
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
  const marker = `- **Pull request**: \`PR-${normalized}\``;
  for (const name of (await readJournalNames(root, relativeDirectory)).sort().reverse()) {
    const relativePath = `${relativeDirectory}/${name}`;
    if ((await readJournalEvidence(root, relativePath)).includes(marker)) {
      return { path: relativePath };
    }
  }
  return createJournalFile(root, now, directory, `${marker}\n`);
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
  const names = (await readJournalNames(root, relativeDirectory))
    .sort()
    .reverse()
    .slice(0, config.context.recentJournalEntries);
  return Promise.all(
    names.map(async (name) => {
      const relativePath = `${relativeDirectory}/${name}`;
      const content = await readJournalEvidence(root, relativePath);
      if (
        branch &&
        content.includes("- **Branch**:") &&
        !content.includes(`- **Branch**: \`${branch.branch}\``)
      ) {
        throw new Error(`Journal branch metadata mismatch: ${relativePath}`);
      }
      return { path: relativePath, content };
    }),
  );
}
