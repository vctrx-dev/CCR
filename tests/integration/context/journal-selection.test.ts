import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { DEFAULT_CONTEXT_CONFIG, serializeContextConfig } from "../../../src/context/config";
import {
  branchDetails,
  ensurePullRequestJournalEntry,
  ensureWorkingJournalEntry,
  finalizeWorkingJournalEntry,
  journalEntryForCommit,
  readRecentJournalEntries,
} from "../../../src/context/journal";
import { createTemporaryRootRegistry, runCommand } from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();

async function createRepository(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  roots.push(root);
  await runCommand("git", ["init", "--quiet", "-b", "main"], { cwd: root });
  await mkdir(path.join(root, ".ccr"));
  await writeFile(
    path.join(root, ".ccr/config.json"),
    serializeContextConfig(DEFAULT_CONTEXT_CONFIG),
    "utf8",
  );
  return root;
}

function journalDocument(metadata: string[], body: string[]): string {
  return [
    "# CCR Journal",
    "",
    "- **Started**: 2026-08-27T01:00:00Z",
    "- **Updated**: 2026-08-27T01:00:00Z",
    ...metadata,
    "",
    "## Summary",
    "",
    ...body,
    "",
  ].join("\n");
}

function journalDocumentAt(updated: string, metadata: string[], body: string[] = []): string {
  return journalDocument(metadata, body).replace(
    "- **Updated**: 2026-08-27T01:00:00Z",
    `- **Updated**: ${updated}`,
  );
}

async function writeJournal(
  root: string,
  directory: string,
  content: string,
  name = "2026-08-27.md",
): Promise<string> {
  const relativePath = `.ccr/journal/${directory}/${name}`;
  await mkdir(path.dirname(path.join(root, relativePath)), { recursive: true });
  await writeFile(path.join(root, relativePath), content, "utf8");
  return relativePath;
}

it("should ignore commit metadata quoted in a journal body", async () => {
  const root = await createRepository("ccr-journal-body-commit-");
  const { directory } = branchDetails(root);
  const commit = "a".repeat(40);
  await writeJournal(
    root,
    directory,
    journalDocument(["- **Base commit**: `unborn`"], [`- **Commit**: \`${commit}\``]),
  );

  expect(await journalEntryForCommit(root, commit, directory)).toBeUndefined();
});

it("should ignore base-commit metadata quoted in a journal body", async () => {
  const root = await createRepository("ccr-journal-body-base-");
  const { directory } = branchDetails(root);
  const quoted = await writeJournal(
    root,
    directory,
    journalDocument([], ["- **Base commit**: `unborn`"]),
  );

  const working = await ensureWorkingJournalEntry(root, new Date("2026-08-28T01:00:00Z"));

  expect(working.path).not.toBe(quoted);
});

it("should ignore pull-request metadata quoted in a journal body", async () => {
  const root = await createRepository("ccr-journal-body-pr-");
  const quoted = await writeJournal(
    root,
    "pull-request-42",
    journalDocument([], ["- **Pull request**: `PR-42`"]),
  );

  const selected = await ensurePullRequestJournalEntry(root, 42, new Date("2026-08-28T01:00:00Z"));

  expect(selected.path).not.toBe(quoted);
});

it("should ignore branch metadata quoted in a journal body", async () => {
  const root = await createRepository("ccr-journal-body-branch-");
  const { directory } = branchDetails(root);
  const relativePath = await writeJournal(
    root,
    directory,
    journalDocument(["- **Base commit**: `unborn`"], ["- **Branch**: `other-branch`"]),
  );

  await expect(readRecentJournalEntries(root)).resolves.toEqual([
    expect.objectContaining({ path: relativePath }),
  ]);
});

it("should select the repository-wide latest journals by Updated regardless of branch or PR", async () => {
  const root = await createRepository("ccr-journal-global-recency-");
  const currentDirectory = branchDetails(root).directory;
  const oldNameLatestUpdate = await writeJournal(
    root,
    "feature-a",
    journalDocumentAt("2026-08-27T05:00:00Z", [
      "- **Branch**: `feature/a`",
      `- **Commit**: \`${"a".repeat(40)}\``,
    ]),
    "2026-08-20.md",
  );
  const pullRequest = await writeJournal(
    root,
    "pull-request-42",
    journalDocumentAt("2026-08-27T04:00:00Z", ["- **Pull request**: `PR-42`"]),
    "2026-08-27.md",
  );
  const currentBranch = await writeJournal(
    root,
    currentDirectory,
    journalDocumentAt("2026-08-27T03:00:00Z", ["- **Base commit**: `unborn`"]),
    "2026-08-26.md",
  );
  await writeJournal(
    root,
    "feature-b",
    journalDocumentAt("2026-08-27T02:00:00Z", [
      "- **Branch**: `feature/b`",
      `- **Commit**: \`${"b".repeat(40)}\``,
    ]),
    "2026-08-27.md",
  );

  await expect(readRecentJournalEntries(root)).resolves.toEqual([
    expect.objectContaining({ path: oldNameLatestUpdate }),
    expect.objectContaining({ path: pullRequest }),
    expect.objectContaining({ path: currentBranch }),
  ]);
});

it("should fail closed when repository-wide recency metadata is ambiguous", async () => {
  const root = await createRepository("ccr-journal-ambiguous-recency-");
  await writeJournal(
    root,
    "feature-a",
    journalDocumentAt("2026-08-27T05:00:00Z", ["- **Base commit**: `unborn`"]).replace(
      "- **Updated**: 2026-08-27T05:00:00Z",
      "- **Updated**: 2026-08-27T05:00:00Z\n- **Updated**: 2026-08-27T06:00:00Z",
    ),
  );

  await expect(readRecentJournalEntries(root)).rejects.toThrow(
    "Journal timestamp metadata is malformed",
  );
});

it("should not select duplicate or conflicting commit header metadata", async () => {
  const root = await createRepository("ccr-journal-duplicate-commit-");
  const { directory } = branchDetails(root);
  const commit = "b".repeat(40);
  await writeJournal(
    root,
    directory,
    journalDocument(
      [
        "- **Branch**: `main`",
        `- **Commit**: \`${commit}\``,
        `- **Commit**: \`${"c".repeat(40)}\``,
        "- **Base commit**: `unborn`",
      ],
      [],
    ),
  );

  expect(await journalEntryForCommit(root, commit, directory)).toBeUndefined();
});

it("should not select duplicate working or pull-request header metadata", async () => {
  const root = await createRepository("ccr-journal-duplicate-selection-");
  const { directory } = branchDetails(root);
  const workingPath = await writeJournal(
    root,
    directory,
    journalDocument(["- **Base commit**: `unborn`", "- **Base commit**: `unborn`"], []),
  );
  const pullRequestPath = await writeJournal(
    root,
    "pull-request-42",
    journalDocument(["- **Pull request**: `PR-42`", "- **Pull request**: `PR-42`"], []),
  );

  expect((await ensureWorkingJournalEntry(root, new Date("2026-08-28T01:00:00Z"))).path).not.toBe(
    workingPath,
  );
  expect(
    (await ensurePullRequestJournalEntry(root, 42, new Date("2026-08-28T01:00:00Z"))).path,
  ).not.toBe(pullRequestPath);
});

it("should reject duplicate conflicting branch ownership metadata", async () => {
  const root = await createRepository("ccr-journal-duplicate-branch-");
  const { directory } = branchDetails(root);
  const commit = "d".repeat(40);
  await writeJournal(
    root,
    directory,
    journalDocument(
      ["- **Branch**: `main`", "- **Branch**: `other-branch`", `- **Commit**: \`${commit}\``],
      [],
    ),
  );

  await expect(readRecentJournalEntries(root)).rejects.toThrow(
    "Journal identity metadata is malformed",
  );
});

it("should replace working identity when finalizing a commit", async () => {
  const root = await createRepository("ccr-journal-finalized-identity-");
  await runCommand("git", ["config", "user.name", "CCR Test"], { cwd: root });
  await runCommand("git", ["config", "user.email", "ccr@example.test"], { cwd: root });
  const working = await ensureWorkingJournalEntry(root, new Date("2026-08-27T01:00:00Z"));
  await writeFile(path.join(root, "change.txt"), "change\n", "utf8");
  await runCommand("git", ["add", "change.txt"], { cwd: root });
  await runCommand("git", ["commit", "--quiet", "-m", "change"], { cwd: root });
  const commit = (await runCommand("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  const { branch, directory } = branchDetails(root);

  await finalizeWorkingJournalEntry(root, { branch, directory, commit });

  const content = await readFile(path.join(root, working.path), "utf8");
  expect(content).not.toContain("**Base commit**");
  expect(await journalEntryForCommit(root, commit, directory)).toEqual(working);
});
