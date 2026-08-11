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

/** Pre-resolved branch identity and commit, supplied by hot paths that already hold them. */
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
 * Creates a journal skeleton whose timestamp, branch, commit, and path come from deterministic
 * inputs. Pass `details` when the caller already resolved branch and commit to avoid Git round-trips.
 */
export async function createJournalEntry(
  root: string,
  now: Date = new Date(),
  changedPaths: string[] = [],
  details?: JournalDetails,
): Promise<JournalResult> {
  const isoTimestamp = now.toISOString().replace(/\.\d{3}Z$/, "Z");
  const timestamp = isoTimestamp.replaceAll(":", "-");
  const { branch, directory } = details ?? branchDetails(root);
  const commit = details?.commit ?? readGitValue(root, ["rev-parse", "HEAD"]);
  const relativePath = await freeJournalPath(root, `.ccr/journal/${directory}`, timestamp);
  const paths = changedPaths.length
    ? changedPaths.map((relativePath) => `- ${relativePath}`).join("\n")
    : "- None recorded.";
  await writeManagedText(
    root,
    relativePath,
    `# CCR Continuity\n\n- **Timestamp**: ${isoTimestamp}\n- **Branch**: \`${branch}\`\n- **Commit**: \`${commit}\`\n\n## Changed paths\n\n${paths}\n\n## Summary\n\nNeeds concise completion.\n\n## Findings and outcomes\n\n- Addressed: none.\n- Deferred: none.\n- Questioned: none.\n- Rejected: none.\n`,
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
  const relativeDirectory = `.ccr/journal/${resolvedDirectory}`;
  const names = await readJournalNames(root, relativeDirectory);
  for (const name of names) {
    const content = await readFile(
      await assertSafeManagedPath(root, `${relativeDirectory}/${name}`),
      "utf8",
    );
    if (content.includes(`- **Commit**: \`${commit}\``)) return true;
  }
  return false;
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
      if (!content.includes(`- **Branch**: \`${branch}\``)) {
        throw new Error(`Journal branch metadata mismatch: ${relativePath}`);
      }
      return { path: relativePath, content };
    }),
  );
}
