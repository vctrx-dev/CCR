import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { DEFAULT_CONTEXT_CONFIG, serializeContextConfig } from "../../../src/context/config";
import {
  branchDetails,
  createJournalEntry,
  ensureJournalEntryForHead,
  ensurePullRequestJournalEntry,
  ensureWorkingJournalEntry,
} from "../../../src/context/journal";
import { createTemporaryRootRegistry, runCommand } from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();

it("should allocate distinct journals when different commits create entries concurrently", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-concurrent-journal-allocation-"));
  roots.push(root);
  await runCommand("git", ["init", "--quiet", "-b", "main"], { cwd: root });
  await mkdir(path.join(root, ".ccr"));
  const directory = branchDetails(root).directory;
  const now = new Date("2026-07-29T11:00:00Z");
  const firstCommit = "a".repeat(40);
  const secondCommit = "b".repeat(40);

  const [first, second] = await Promise.all([
    createJournalEntry(root, now, { branch: "main", directory, commit: firstCommit }),
    createJournalEntry(root, now, { branch: "main", directory, commit: secondCommit }),
  ]);

  expect(first.path).not.toBe(second.path);
  expect(await readFile(path.join(root, first.path), "utf8")).toContain(firstCommit);
  expect(await readFile(path.join(root, second.path), "utf8")).toContain(secondCommit);
});

it("should reuse one semantic journal when ensure operations run concurrently", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-concurrent-journal-ensure-"));
  roots.push(root);
  await runCommand("git", ["init", "--quiet", "-b", "main"], { cwd: root });
  await runCommand("git", ["config", "user.name", "CCR Test"], { cwd: root });
  await runCommand("git", ["config", "user.email", "ccr@example.test"], { cwd: root });
  await mkdir(path.join(root, ".ccr"));
  await writeFile(
    path.join(root, ".ccr/config.json"),
    serializeContextConfig(DEFAULT_CONTEXT_CONFIG),
    "utf8",
  );
  await writeFile(path.join(root, "file.txt"), "test\n", "utf8");
  await runCommand("git", ["add", "file.txt"], { cwd: root });
  await runCommand("git", ["commit", "--quiet", "-m", "test"], { cwd: root });
  const now = new Date("2026-07-29T11:00:00Z");

  const working = await Promise.all([
    ensureWorkingJournalEntry(root, now),
    ensureWorkingJournalEntry(root, now),
  ]);
  const committed = await Promise.all([
    ensureJournalEntryForHead(root, now),
    ensureJournalEntryForHead(root, now),
  ]);
  const pullRequest = await Promise.all([
    ensurePullRequestJournalEntry(root, 42, now),
    ensurePullRequestJournalEntry(root, 42, now),
  ]);

  expect(new Set(working.map(({ path: entryPath }) => entryPath))).toHaveLength(1);
  expect(new Set(committed.map(({ path: entryPath }) => entryPath))).toHaveLength(1);
  expect(new Set(pullRequest.map(({ path: entryPath }) => entryPath))).toHaveLength(1);
});
