import type { Dirent } from "node:fs";
import { truncateEvidence } from "./evidence-format";
import {
  assertSafeManagedPath,
  createManagedTextExclusive,
  readBoundedManagedDirectory,
  readBoundedUtf8TextIfExists,
  writeManagedText,
  writeManagedTextIfUnchanged,
} from "./files";
import {
  MAX_JOURNAL_FILE_CHARACTERS,
  assertJournalContentWithinLimit,
  createJournalDocument,
  refreshJournalActivity,
} from "./journal-document";

/**
 * Internal journal-entry storage boundary. Keep filename allocation, bounded content access, and
 * activity metadata migration here; identity workflow selection belongs in `journal.ts`, while
 * repository-wide activity selection belongs in `journal-recency.ts`.
 */

export interface JournalResult {
  path: string;
}

export interface JournalEntry extends JournalResult {
  content: string;
}

const JOURNAL_FILENAME_PATTERN =
  /^(\d{4}-\d{2}-\d{2})(?:T(\d{2})-(\d{2})-(\d{2})Z)?(?:\.(\d+))?\.md$/u;
const MAX_JOURNAL_EVIDENCE_CHARACTERS = 4_000;
const MAX_JOURNAL_SCAN_ENTRY_COUNT = 10_000;

interface JournalScanBudget {
  entryCount: number;
}

async function readBoundedDirectory(
  root: string,
  relativeDirectory: string,
  budget: JournalScanBudget,
): Promise<Dirent[]> {
  const remaining = MAX_JOURNAL_SCAN_ENTRY_COUNT - budget.entryCount;
  const entries = await readBoundedManagedDirectory(root, relativeDirectory, remaining);
  budget.entryCount += entries.length;
  return entries;
}

function compareJournalNames(left: string, right: string): number {
  const leftMatch = JOURNAL_FILENAME_PATTERN.exec(left);
  const rightMatch = JOURNAL_FILENAME_PATTERN.exec(right);
  if (leftMatch === null || rightMatch === null) return right.localeCompare(left);

  const leftTimestamp = `${leftMatch[1]}T${leftMatch[2] ?? "00"}-${leftMatch[3] ?? "00"}-${leftMatch[4] ?? "00"}Z`;
  const rightTimestamp = `${rightMatch[1]}T${rightMatch[2] ?? "00"}-${rightMatch[3] ?? "00"}-${rightMatch[4] ?? "00"}Z`;
  const timestampOrder = rightTimestamp.localeCompare(leftTimestamp);
  if (timestampOrder !== 0) return timestampOrder;

  const suffixOrder = Number(rightMatch[5] ?? "0") - Number(leftMatch[5] ?? "0");
  return suffixOrder !== 0 ? suffixOrder : right.localeCompare(left);
}

/** Lists recognized journal filenames from newest to oldest. */
async function readSortedJournalNamesWithBudget(
  root: string,
  relativeDirectory: string,
  budget: JournalScanBudget,
): Promise<string[]> {
  const entries = await readBoundedDirectory(root, relativeDirectory, budget);
  const names: string[] = [];
  for (const entry of entries) {
    if (!JOURNAL_FILENAME_PATTERN.test(entry.name)) continue;
    const relativePath = `${relativeDirectory}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      throw new Error(`Managed path is a symbolic link: ${relativePath}`);
    }
    if (!entry.isFile()) throw new Error(`Journal path is not a regular file: ${relativePath}`);
    names.push(entry.name);
  }
  return names.sort(compareJournalNames);
}

/** Lists recognized journal filenames from newest to oldest. */
export async function readSortedJournalNames(
  root: string,
  relativeDirectory: string,
): Promise<string[]> {
  return readSortedJournalNamesWithBudget(root, relativeDirectory, { entryCount: 0 });
}

async function readJournalPathInventory(
  root: string,
): Promise<{ directories: Set<string>; entryCount: number; paths: string[] }> {
  const journalRoot = ".ccr/journal";
  const budget = { entryCount: 0 };
  const directories = await readBoundedDirectory(root, journalRoot, budget);
  const directoryPaths = new Set<string>();
  const paths: string[] = [];
  for (const entry of directories) {
    const relativeDirectory = `${journalRoot}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      throw new Error(`Managed path is a symbolic link: ${relativeDirectory}`);
    }
    if (!entry.isDirectory()) continue;
    directoryPaths.add(relativeDirectory);
    for (const name of await readSortedJournalNamesWithBudget(root, relativeDirectory, budget)) {
      paths.push(`${relativeDirectory}/${name}`);
    }
  }
  return { directories: directoryPaths, entryCount: budget.entryCount, paths };
}

/** Lists every recognized local journal path with a bound that fails closed on unsafe trees. */
export async function readJournalPaths(root: string): Promise<string[]> {
  return (await readJournalPathInventory(root)).paths;
}

/** Formats already-bounded journal content for context presentation. */
export function formatJournalEvidence(content: string): string {
  return truncateEvidence(content, {
    isTruncated: content.length > MAX_JOURNAL_EVIDENCE_CHARACTERS,
    marker: `[CCR journal truncated at ${MAX_JOURNAL_EVIDENCE_CHARACTERS} characters]`,
    maximumCharacters: MAX_JOURNAL_EVIDENCE_CHARACTERS,
  });
}

/** Reads bounded journal evidence suitable for context presentation and metadata lookup. */
export async function readJournalEvidence(root: string, relativePath: string): Promise<string> {
  return formatJournalEvidence(await readCompleteJournalEntry(root, relativePath));
}

/** Reads one complete journal under the managed 64,000-character safety bound. */
export async function readCompleteJournalEntry(
  root: string,
  relativePath: string,
): Promise<string> {
  const bounded = await readBoundedUtf8TextIfExists(
    await assertSafeManagedPath(root, relativePath),
    MAX_JOURNAL_FILE_CHARACTERS,
  );
  if (bounded === undefined) throw new Error(`Journal entry disappeared: ${relativePath}`);
  if (bounded.isBinary) {
    throw new Error(`Journal entry is not valid UTF-8 text: ${relativePath}`);
  }
  if (bounded.isTruncated) {
    throw new Error(
      `Journal entry exceeds ${MAX_JOURNAL_FILE_CHARACTERS} characters: ${relativePath}`,
    );
  }
  return bounded.content;
}

/** Writes one complete journal only while it remains inside the managed content bound. */
export async function writeJournalFile(
  root: string,
  relativePath: string,
  content: string,
): Promise<void> {
  assertJournalContentWithinLimit(content, relativePath);
  await writeManagedText(root, relativePath, content);
}

/** Replaces an already-read journal only when its complete content remains exactly unchanged. */
export async function replaceJournalFileIfUnchanged(
  root: string,
  relativePath: string,
  expectedContent: string,
  content: string,
): Promise<void> {
  assertJournalContentWithinLimit(content, relativePath);
  if (!(await writeManagedTextIfUnchanged(root, relativePath, expectedContent, content))) {
    throw new Error(`Journal entry changed during update: ${relativePath}`);
  }
}

/** Refreshes one already-loaded journal and persists its activity metadata when changed. */
export async function refreshJournalEntry(
  root: string,
  entry: JournalEntry,
  now: Date,
): Promise<JournalEntry> {
  const content = refreshJournalActivity(entry.content, now, entry.path);
  if (content !== entry.content) {
    await replaceJournalFileIfUnchanged(root, entry.path, entry.content, content);
  }
  return { path: entry.path, content };
}

/** Refreshes activity metadata for one journal selected by path. */
export async function refreshJournalPath(
  root: string,
  relativePath: string,
  now: Date,
): Promise<void> {
  await refreshJournalEntry(
    root,
    { path: relativePath, content: await readCompleteJournalEntry(root, relativePath) },
    now,
  );
}

/** Creates one date-named journal skeleton with collision-safe suffix allocation. */
export async function createJournalFile(
  root: string,
  now: Date,
  directory: string,
  identityMetadata = "",
): Promise<JournalResult> {
  const document = createJournalDocument(now, identityMetadata);
  const date = document.timestamp.slice(0, 10);
  const relativeDirectory = `.ccr/journal/${directory}`;
  const inventory = await readJournalPathInventory(root);
  const requiredEntries = inventory.directories.has(relativeDirectory) ? 1 : 2;
  if (inventory.entryCount + requiredEntries > MAX_JOURNAL_SCAN_ENTRY_COUNT) {
    throw new Error(`Journal tree cannot exceed ${MAX_JOURNAL_SCAN_ENTRY_COUNT} entries.`);
  }
  const base = `${relativeDirectory}/${date}`;
  for (let index = 0; index < MAX_JOURNAL_SCAN_ENTRY_COUNT; index += 1) {
    const relativePath = `${base}${index === 0 ? "" : `.${index}`}.md`;
    if (await createManagedTextExclusive(root, relativePath, document.content)) {
      return { path: relativePath };
    }
  }
  throw new Error(`Journal filename allocation exceeds ${MAX_JOURNAL_SCAN_ENTRY_COUNT} attempts.`);
}
