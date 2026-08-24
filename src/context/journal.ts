import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import {
  assertSafeManagedPath,
  isFileNotFound,
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

/**
 * Creates a journal skeleton. Omit `details` for uncommitted work so the entry does not claim the
 * current HEAD contains those changes; pass it only when the represented commit already exists.
 */
export async function createJournalEntry(
  root: string,
  now: Date = new Date(),
  details?: JournalDetails,
): Promise<JournalResult> {
  const isoTimestamp = now.toISOString().replace(/\.\d{3}Z$/, "Z");
  const timestamp = isoTimestamp.replaceAll(":", "-");
  const { directory } = details ?? branchDetails(root);
  const relativePath = await freeJournalPath(root, `.ccr/journal/${directory}`, timestamp);
  const committedMetadata = details
    ? `- **Branch**: \`${details.branch}\`\n- **Commit**: \`${details.commit}\`\n`
    : "";
  await writeManagedText(
    root,
    relativePath,
    `# CCR Journal\n\n- **Timestamp**: ${isoTimestamp}\n${committedMetadata}\n## Summary\n\nNeeds concise completion.\n\n## Findings and outcomes\n\n- Addressed: none.\n- Deferred: none.\n- Questioned: none.\n- Rejected: none.\n`,
  );
  return { path: relativePath };
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
  return (await findJournalEntryForCommit(root, commit, resolvedDirectory)) !== undefined;
}

async function findJournalEntryForCommit(
  root: string,
  commit: string,
  directory: string,
): Promise<JournalResult | undefined> {
  const relativeDirectory = `.ccr/journal/${directory}`;
  const names = (await readJournalNames(root, relativeDirectory)).sort().reverse();
  for (const name of names) {
    const content = await readFile(
      await assertSafeManagedPath(root, `${relativeDirectory}/${name}`),
      "utf8",
    );
    if (content.includes(`- **Commit**: \`${commit}\``)) {
      return { path: `${relativeDirectory}/${name}` };
    }
  }
  return undefined;
}

async function findWorkingJournalEntry(
  root: string,
  directory: string,
): Promise<JournalEntry | undefined> {
  const relativeDirectory = `.ccr/journal/${directory}`;
  const names = (await readJournalNames(root, relativeDirectory)).sort().reverse();
  for (const name of names) {
    const relativePath = `${relativeDirectory}/${name}`;
    const content = await readFile(await assertSafeManagedPath(root, relativePath), "utf8");
    if (!content.includes("- **Commit**:")) return { path: relativePath, content };
  }
  return undefined;
}

/** Returns the branch's pending journal, creating one without branch or commit metadata if needed. */
export async function ensureWorkingJournalEntry(
  root: string,
  now: Date = new Date(),
): Promise<JournalResult> {
  const { directory } = branchDetails(root);
  const existing = await findWorkingJournalEntry(root, directory);
  return existing ? { path: existing.path } : createJournalEntry(root, now);
}

/** Attaches real commit metadata to the newest pending journal after that commit exists. */
export async function finalizeWorkingJournalEntry(
  root: string,
  details: JournalDetails,
): Promise<JournalResult | undefined> {
  const working = await findWorkingJournalEntry(root, details.directory);
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

function currentCommit(root: string): string {
  try {
    return readGitValue(root, ["rev-parse", "HEAD"]);
  } catch {
    return "unborn";
  }
}

/** Returns the existing current-commit journal or creates its sole review continuity entry. */
export async function ensureJournalEntryForHead(
  root: string,
  now: Date = new Date(),
): Promise<JournalResult> {
  const { branch, directory } = branchDetails(root);
  const commit = currentCommit(root);
  const existing = await findJournalEntryForCommit(root, commit, directory);
  if (existing) return existing;
  return createJournalEntry(root, now, { branch, directory, commit });
}

/** Reads only the configured number of newest entries for the exact current branch. */
export async function readRecentJournalEntries(root: string): Promise<JournalEntry[]> {
  const config = await readResolvedContextConfig(root);
  const { branch, directory } = branchDetails(root);
  const relativeDirectory = `.ccr/journal/${directory}`;
  const names = (await readJournalNames(root, relativeDirectory))
    .sort()
    .reverse()
    .slice(0, config.context.recentJournalEntries);
  return Promise.all(
    names.map(async (name) => {
      const relativePath = `${relativeDirectory}/${name}`;
      const content = await readFile(await assertSafeManagedPath(root, relativePath), "utf8");
      if (content.includes("- **Branch**:") && !content.includes(`- **Branch**: \`${branch}\``)) {
        throw new Error(`Journal branch metadata mismatch: ${relativePath}`);
      }
      return { path: relativePath, content };
    }),
  );
}
