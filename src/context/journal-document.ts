import { z } from "zod";

/**
 * Pure model for CCR's human-editable journal document. Storage and workflow modules reuse these
 * parsers and transformations so identity, timestamps, bounds, and completion rules cannot drift.
 */

export const MAX_JOURNAL_FILE_CHARACTERS = 64_000;
export const JOURNAL_COMPLETION_PLACEHOLDER = "Needs concise completion.";

const journalPathSchema = z
  .string()
  .min(1)
  .max(500)
  .regex(/^\.ccr\/journal\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\.md$/u);
const journalTimestampSchema = z.iso.datetime({ offset: false, precision: 0 });
const journalBranchIdentitySchema = z
  .string()
  .min(1)
  .max(1_024)
  .refine((value) =>
    Array.from(value).every((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    }),
  );
const journalCommitIdentitySchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u);
const journalBaseCommitIdentitySchema = z.union([z.literal("unborn"), journalCommitIdentitySchema]);
const pullRequestTokenSchema = z
  .string()
  .regex(/^PR-[1-9][0-9]*$/u)
  .transform((value) => Number(value.slice(3)))
  .pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER));
const JOURNAL_SUMMARY_PATTERN = /^## Summary\r?$/mu;
const JOURNAL_STARTED_PATTERN = /^- \*\*Started\*\*: ([^\r\n]+)$/mu;
const JOURNAL_UPDATED_PATTERN = /^- \*\*Updated\*\*: ([^\r\n]+)$/mu;
const LEGACY_JOURNAL_TIMESTAMP_PATTERN = /^- \*\*Timestamp\*\*: ([^\r\n]+)$/mu;

export type JournalIdentity =
  | { kind: "none" }
  | { kind: "malformed" }
  | { branch: string; commit: string; kind: "commit" }
  | { baseCommit: string; kind: "working" }
  | { kind: "pull-request"; pullRequest: number };

export interface JournalDocumentInspection {
  commitValues: string[];
  hasAllOutcomeCategories: boolean;
  hasCanonicalHeading: boolean;
  identity: JournalIdentity;
  outcomes: string;
  startedValues: string[];
  summary: string;
  updatedValues: string[];
}

function readIdentityValues(header: string, label: string): string[] | undefined {
  const prefix = `- **${label}**:`;
  const exactPrefix = `${prefix} \``;
  const values: string[] = [];
  for (const line of header.split(/\r?\n/u)) {
    if (!line.startsWith(prefix)) continue;
    if (!line.startsWith(exactPrefix) || !line.endsWith("`")) return undefined;
    const value = line.slice(exactPrefix.length, -1);
    if (value.length === 0 || value.includes("`")) return undefined;
    values.push(value);
  }
  return values;
}

/** Parses ownership only from the metadata header before `## Summary`. */
export function parseJournalIdentity(content: string): JournalIdentity {
  const summary = JOURNAL_SUMMARY_PATTERN.exec(content);
  if (summary?.index === undefined) return { kind: "none" };
  const header = content.slice(0, summary.index);
  const branches = readIdentityValues(header, "Branch");
  const commits = readIdentityValues(header, "Commit");
  const baseCommits = readIdentityValues(header, "Base commit");
  const pullRequests = readIdentityValues(header, "Pull request");
  if (
    branches === undefined ||
    commits === undefined ||
    baseCommits === undefined ||
    pullRequests === undefined
  ) {
    return { kind: "malformed" };
  }
  if (
    branches.length === 0 &&
    commits.length === 0 &&
    baseCommits.length === 0 &&
    pullRequests.length === 0
  ) {
    return { kind: "none" };
  }
  if (
    branches.length === 1 &&
    commits.length === 1 &&
    baseCommits.length === 0 &&
    pullRequests.length === 0
  ) {
    const branch = journalBranchIdentitySchema.safeParse(branches[0]);
    const commit = journalCommitIdentitySchema.safeParse(commits[0]);
    if (branch.success && commit.success) {
      return { kind: "commit", branch: branch.data, commit: commit.data };
    }
  }
  if (
    branches.length === 0 &&
    commits.length === 0 &&
    baseCommits.length === 1 &&
    pullRequests.length === 0
  ) {
    const baseCommit = journalBaseCommitIdentitySchema.safeParse(baseCommits[0]);
    if (baseCommit.success) return { kind: "working", baseCommit: baseCommit.data };
  }
  if (
    branches.length === 0 &&
    commits.length === 0 &&
    baseCommits.length === 0 &&
    pullRequests.length === 1
  ) {
    const pullRequest = pullRequestTokenSchema.safeParse(pullRequests[0]);
    if (pullRequest.success) return { kind: "pull-request", pullRequest: pullRequest.data };
  }
  return { kind: "malformed" };
}

/** Returns structured completion metadata without mutating the source document. */
export function inspectJournalDocument(content: string): JournalDocumentInspection {
  const summaryHeading = content.indexOf("## Summary");
  const outcomesHeading = content.indexOf("## Findings and outcomes");
  const summary =
    summaryHeading < 0 || outcomesHeading <= summaryHeading
      ? ""
      : content.slice(summaryHeading + "## Summary".length, outcomesHeading).trim();
  const outcomes = outcomesHeading < 0 ? "" : content.slice(outcomesHeading).trim();
  return {
    commitValues: [...content.matchAll(/^- \*\*Commit\*\*: `([^`\r\n]+)`$/gmu)].flatMap((match) =>
      match[1] === undefined ? [] : [match[1]],
    ),
    hasAllOutcomeCategories: ["Addressed", "Deferred", "Questioned", "Rejected"].every((category) =>
      new RegExp(`^- ${category}:\\s*\\S`, "mu").test(outcomes),
    ),
    hasCanonicalHeading: (content.split(/\r?\n/u, 1)[0] ?? "") === "# CCR Journal",
    identity: parseJournalIdentity(content),
    outcomes,
    startedValues: [...content.matchAll(/^- \*\*Started\*\*: ([^\r\n]+)$/gmu)].flatMap((match) =>
      match[1] === undefined ? [] : [match[1]],
    ),
    summary,
    updatedValues: [...content.matchAll(/^- \*\*Updated\*\*: ([^\r\n]+)$/gmu)].flatMap((match) =>
      match[1] === undefined ? [] : [match[1]],
    ),
  };
}

/** Checks the exact completed-commit shape required by automatic context updates. */
export function isCompletedCommitJournal(
  content: string,
  commit: string,
  expectedStarted: string,
): boolean {
  const inspected = inspectJournalDocument(content);
  const started = inspected.startedValues[0] ?? "";
  const updated = inspected.updatedValues[0] ?? "";
  return !(
    !inspected.hasCanonicalHeading ||
    inspected.startedValues.length !== 1 ||
    inspected.updatedValues.length !== 1 ||
    inspected.commitValues.length !== 1 ||
    started !== expectedStarted ||
    !isValidJournalTimestamp(started) ||
    !isValidJournalTimestamp(updated) ||
    updated < started ||
    inspected.commitValues[0] !== commit ||
    inspected.summary.length === 0 ||
    inspected.summary.includes(JOURNAL_COMPLETION_PLACEHOLDER) ||
    !inspected.hasAllOutcomeCategories
  );
}

/** Validates one journal path before it can select local continuity state. */
export function parseJournalPath(candidate: unknown): string {
  return journalPathSchema.parse(candidate);
}

/** Returns whether a timestamp uses CCR's second-precision UTC representation. */
export function isValidJournalTimestamp(value: string): boolean {
  return journalTimestampSchema.safeParse(value).success;
}

/** Rejects output before a write can exceed the complete journal boundary. */
export function assertJournalContentWithinLimit(content: string, relativePath: string): void {
  if (content.length > MAX_JOURNAL_FILE_CHARACTERS) {
    throw new Error(
      `Journal entry exceeds ${MAX_JOURNAL_FILE_CHARACTERS} characters: ${relativePath}`,
    );
  }
}

function journalTimestamp(now: Date): string {
  return now.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function parsedJournalTimestamp(value: string, relativePath: string): string {
  if (!isValidJournalTimestamp(value)) {
    throw new Error(`Journal timestamp metadata is malformed: ${relativePath}`);
  }
  return value;
}

/** Refreshes current activity metadata and migrates a valid legacy timestamp when encountered. */
export function refreshJournalActivity(content: string, now: Date, relativePath: string): string {
  const lineEnding = content.includes("\r\n") ? "\r\n" : "\n";
  const nextTimestamp = journalTimestamp(now);
  const startedMatch = content.match(JOURNAL_STARTED_PATTERN);
  const updatedMatch = content.match(JOURNAL_UPDATED_PATTERN);
  if (startedMatch !== null && updatedMatch !== null) {
    const started = parsedJournalTimestamp(startedMatch[1] ?? "", relativePath);
    const updated = parsedJournalTimestamp(updatedMatch[1] ?? "", relativePath);
    const latest = [started, updated, nextTimestamp].sort().at(-1);
    if (latest === undefined) {
      throw new Error(`Journal timestamp metadata is malformed: ${relativePath}`);
    }
    return content.replace(updatedMatch[0], `- **Updated**: ${latest}`);
  }
  if (startedMatch !== null || updatedMatch !== null) {
    throw new Error(`Journal timestamp metadata is malformed: ${relativePath}`);
  }
  const legacyMatch = content.match(LEGACY_JOURNAL_TIMESTAMP_PATTERN);
  if (legacyMatch === null) {
    throw new Error(`Journal timestamp metadata is malformed: ${relativePath}`);
  }
  const started = parsedJournalTimestamp(legacyMatch[1] ?? "", relativePath);
  const latest = [started, nextTimestamp].sort().at(-1);
  if (latest === undefined) {
    throw new Error(`Journal timestamp metadata is malformed: ${relativePath}`);
  }
  return content.replace(
    legacyMatch[0],
    `- **Started**: ${started}${lineEnding}- **Updated**: ${latest}`,
  );
}

/** Creates the canonical journal skeleton and its normalized timestamp. */
export function createJournalDocument(
  now: Date,
  identityMetadata = "",
): { content: string; timestamp: string } {
  const timestamp = journalTimestamp(now);
  return {
    content: `# CCR Journal\n\n- **Started**: ${timestamp}\n- **Updated**: ${timestamp}\n${identityMetadata}\n## Summary\n\n${JOURNAL_COMPLETION_PLACEHOLDER}\n\n## Findings and outcomes\n\n- Addressed: none.\n- Deferred: none.\n- Questioned: none.\n- Rejected: none.\n`,
    timestamp,
  };
}
