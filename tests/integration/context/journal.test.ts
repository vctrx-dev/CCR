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
  finalizeWorkingJournalEntry,
  journalEntryExistsForCommit,
  readRecentJournalEntries,
} from "../../../src/context/journal";
import { createTemporaryRootRegistry, runCommand } from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();

it("should create a branch-local working journal without premature commit metadata", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-journal-"));
  roots.push(root);
  await runCommand("git", ["init", "--quiet", "-b", "feature/context"], { cwd: root });
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

  const result = await createJournalEntry(root, new Date("2026-07-29T06:45:12Z"));
  const content = await readFile(path.join(root, result.path), "utf8");

  expect(result.path).toMatch(/^\.ccr\/journal\/feature_context-[0-9a-f]{8}\/2026-07-29\.md$/);
  expect(content).toContain("**Started**: 2026-07-29T06:45:12Z");
  expect(content).toContain("**Updated**: 2026-07-29T06:45:12Z");
  expect(content).not.toContain("**Timestamp**");
  expect(content).toContain("# CCR Journal");
  expect(content).not.toContain("CCR Continuity");
  expect(content).not.toContain("**Branch**");
  expect(content).not.toContain("**Commit**");
  expect(content).not.toContain("## Changed paths");

  const newer = await ensureWorkingJournalEntry(root, new Date("2026-07-29T07:45:12Z"));
  expect(newer).toEqual(result);
  const refreshed = await readFile(path.join(root, result.path), "utf8");
  expect(refreshed).toContain("**Started**: 2026-07-29T06:45:12Z");
  expect(refreshed).toContain("**Updated**: 2026-07-29T07:45:12Z");
  const recent = await readRecentJournalEntries(root);
  expect(recent.map((entry) => entry.path)).toEqual([result.path]);
});

it("should record commit metadata only for a committed journal", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-journal-exists-"));
  roots.push(root);
  await runCommand("git", ["init", "--quiet", "-b", "main"], { cwd: root });
  await runCommand("git", ["config", "user.name", "CCR Test"], { cwd: root });
  await runCommand("git", ["config", "user.email", "ccr@example.test"], { cwd: root });
  await mkdir(path.join(root, ".ccr"));
  await writeFile(path.join(root, "main.py"), "print(1)\n", "utf8");
  await runCommand("git", ["add", "main.py"], { cwd: root });
  await runCommand("git", ["commit", "--quiet", "-m", "first"], { cwd: root });
  const commit = (await runCommand("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  const otherCommit = "0".repeat(40);

  expect(await journalEntryExistsForCommit(root, commit)).toBe(false);
  expect(await journalEntryExistsForCommit(root, otherCommit)).toBe(false);

  const { branch, directory } = branchDetails(root);
  const result = await createJournalEntry(root, new Date("2026-07-29T09:00:00Z"), {
    branch,
    directory,
    commit,
  });
  const content = await readFile(path.join(root, result.path), "utf8");
  expect(content).toContain(`**Branch**: \`${branch}\``);
  expect(content).toContain(`**Commit**: \`${commit}\``);
  expect(content).not.toContain("## Changed paths");

  expect(await journalEntryExistsForCommit(root, commit)).toBe(true);
  expect(await journalEntryExistsForCommit(root, otherCommit)).toBe(false);
});

it("should not overwrite journal entries created on the same date", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-journal-collision-"));
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

  const sameDate = new Date("2026-07-29T10:00:00Z");
  const first = await createJournalEntry(root, sameDate);
  const second = await createJournalEntry(root, sameDate);
  const third = await createJournalEntry(root, new Date("2026-07-29T10:01:00Z"));
  const fourth = await createJournalEntry(root, new Date("2026-07-29T10:02:00Z"));

  expect(second.path).not.toBe(first.path);
  for (const entry of [first, second]) {
    const content = await readFile(path.join(root, entry.path), "utf8");
    expect(content).not.toContain("**Commit**");
  }

  const recent = await readRecentJournalEntries(root);
  expect(recent.map((entry) => entry.path)).toHaveLength(
    DEFAULT_CONTEXT_CONFIG.context.recentJournalEntries,
  );
  expect(recent.map((entry) => entry.path)).toEqual([fourth.path, third.path, second.path]);
});

it("should attach commit metadata to the existing working journal after commit", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-journal-finalize-"));
  roots.push(root);
  await runCommand("git", ["init", "--quiet", "-b", "development"], { cwd: root });
  await runCommand("git", ["config", "user.name", "CCR Test"], { cwd: root });
  await runCommand("git", ["config", "user.email", "ccr@example.test"], { cwd: root });
  await mkdir(path.join(root, ".ccr"));
  const working = await ensureWorkingJournalEntry(root, new Date("2026-07-29T11:00:00Z"));
  await writeFile(path.join(root, "file.txt"), "test\n", "utf8");
  await runCommand("git", ["add", "file.txt"], { cwd: root });
  await runCommand("git", ["commit", "--quiet", "-m", "test"], { cwd: root });
  const commit = (await runCommand("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  const { branch, directory } = branchDetails(root);

  const finalized = await finalizeWorkingJournalEntry(
    root,
    { branch, directory, commit },
    new Date("2026-07-31T08:30:00Z"),
  );

  expect(finalized).toEqual(working);
  const content = await readFile(path.join(root, working.path), "utf8");
  expect(content).toContain("**Started**: 2026-07-29T11:00:00Z");
  expect(content).toContain("**Updated**: 2026-07-31T08:30:00Z");
  expect(content.indexOf("**Updated**")).toBeLessThan(content.indexOf("**Branch**"));
  expect(content).toContain("**Branch**: `development`");
  expect(content).toContain(`**Commit**: \`${commit}\``);
  expect(content).not.toContain("## Changed paths");
});

it("should reuse one review journal entry for repeated reviews of the same commit", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-review-journal-"));
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

  const first = await ensureJournalEntryForHead(root, new Date("2026-07-29T11:00:00Z"));
  const second = await ensureJournalEntryForHead(root, new Date("2026-07-29T12:00:00Z"));
  const clockSkewed = await ensureJournalEntryForHead(root, new Date("2026-07-29T11:30:00Z"));

  expect(second).toEqual(first);
  expect(clockSkewed).toEqual(first);
  expect(await readFile(path.join(root, first.path), "utf8")).toContain(
    "**Updated**: 2026-07-29T12:00:00Z",
  );
  expect((await readRecentJournalEntries(root)).map(({ path: entryPath }) => entryPath)).toEqual([
    first.path,
  ]);
});

it("should create separate date-suffixed journals for different commits on the same date", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-commit-journals-date-"));
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

  await writeFile(path.join(root, "first.txt"), "first\n", "utf8");
  await runCommand("git", ["add", "first.txt"], { cwd: root });
  await runCommand("git", ["commit", "--quiet", "-m", "first"], { cwd: root });
  const firstCommit = (await runCommand("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  const first = await ensureJournalEntryForHead(root, new Date("2026-07-29T10:00:00Z"));

  await writeFile(path.join(root, "second.txt"), "second\n", "utf8");
  await runCommand("git", ["add", "second.txt"], { cwd: root });
  await runCommand("git", ["commit", "--quiet", "-m", "second"], { cwd: root });
  const secondCommit = (
    await runCommand("git", ["rev-parse", "HEAD"], { cwd: root })
  ).stdout.trim();
  const second = await ensureJournalEntryForHead(root, new Date("2026-07-29T11:00:00Z"));

  expect(first.path).toMatch(/\/2026-07-29\.md$/);
  expect(second.path).toMatch(/\/2026-07-29\.1\.md$/);
  expect(second.path).not.toBe(first.path);
  expect(await readFile(path.join(root, first.path), "utf8")).toContain(firstCommit);
  expect(await readFile(path.join(root, second.path), "utf8")).toContain(secondCommit);
});

it("should reuse a working journal after its bounded evidence preview is truncated", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-large-working-journal-"));
  roots.push(root);
  await runCommand("git", ["init", "--quiet", "-b", "main"], { cwd: root });
  await mkdir(path.join(root, ".ccr"));
  const first = await ensureWorkingJournalEntry(root, new Date("2026-07-29T11:00:00Z"));
  await writeFile(
    path.join(root, first.path),
    `${await readFile(path.join(root, first.path), "utf8")}${"x".repeat(10_000)}`,
    "utf8",
  );

  const repeated = await ensureWorkingJournalEntry(root, new Date("2026-07-29T12:00:00Z"));

  expect(repeated).toEqual(first);
});

it("should reuse one isolated journal entry for each pull request", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-pr-journal-"));
  roots.push(root);
  await runCommand("git", ["init", "--quiet", "-b", "main"], { cwd: root });
  await mkdir(path.join(root, ".ccr"));
  await writeFile(
    path.join(root, ".ccr/config.json"),
    serializeContextConfig(DEFAULT_CONTEXT_CONFIG),
    "utf8",
  );

  const first = await ensurePullRequestJournalEntry(root, 42, new Date("2026-07-29T11:00:00Z"));
  const repeated = await ensurePullRequestJournalEntry(root, 42, new Date("2026-07-29T12:00:00Z"));
  const other = await ensurePullRequestJournalEntry(root, 43, new Date("2026-07-29T13:00:00Z"));

  expect(repeated).toEqual(first);
  expect(other).not.toEqual(first);
  const firstContent = await readFile(path.join(root, first.path), "utf8");
  expect(firstContent).toContain("**Pull request**: `PR-42`");
  expect(firstContent).toContain("**Updated**: 2026-07-29T12:00:00Z");
  expect((await readRecentJournalEntries(root)).map(({ path: entryPath }) => entryPath)).toEqual([
    other.path,
    first.path,
  ]);
});

it("should bound recent journal content before returning it", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-bounded-journal-"));
  roots.push(root);
  await runCommand("git", ["init", "--quiet", "-b", "main"], { cwd: root });
  await mkdir(path.join(root, ".ccr"));
  await writeFile(
    path.join(root, ".ccr/config.json"),
    serializeContextConfig(DEFAULT_CONTEXT_CONFIG),
    "utf8",
  );
  const journal = await createJournalEntry(root, new Date("2026-07-29T14:00:00Z"));
  await writeFile(
    path.join(root, journal.path),
    `${await readFile(path.join(root, journal.path), "utf8")}${"a".repeat(4_000)}PRIVATE_SUFFIX`,
    "utf8",
  );

  const [recent] = await readRecentJournalEntries(root);

  expect(recent?.content).toContain("[CCR journal truncated at 4000 characters]");
  expect(recent?.content).not.toContain("PRIVATE_SUFFIX");
});

it("should skip an oversized committed journal when resolving later working continuity", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-oversized-committed-journal-"));
  roots.push(root);
  await runCommand("git", ["init", "--quiet", "-b", "main"], { cwd: root });
  await mkdir(path.join(root, ".ccr"));
  await writeFile(
    path.join(root, ".ccr/config.json"),
    serializeContextConfig(DEFAULT_CONTEXT_CONFIG),
    "utf8",
  );
  const details = {
    branch: "main",
    directory: branchDetails(root).directory,
    commit: "a".repeat(40),
  };
  const committed = await createJournalEntry(root, new Date("2026-07-29T15:00:00Z"), details);
  await writeFile(
    path.join(root, committed.path),
    `# CCR Journal\n\n- **Timestamp**: 2026-07-29T15:00:00Z\n- **Branch**: \`main\`\n- **Commit**: \`${details.commit}\`\n\n${"x".repeat(4_100)}`,
    "utf8",
  );

  const working = await ensureWorkingJournalEntry(root, new Date("2026-07-29T16:00:00Z"));

  expect(working.path).not.toBe(committed.path);
  expect(await readFile(path.join(root, working.path), "utf8")).not.toContain("**Commit**");
});
