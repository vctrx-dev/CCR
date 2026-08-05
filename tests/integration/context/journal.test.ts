import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";
import { DEFAULT_CONTEXT_CONFIG } from "../../../src/context/config";
import {
  createJournalEntry,
  journalEntryExistsForCommit,
  readRecentJournalEntries,
} from "../../../src/context/journal";

const run = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

it("should derive journal path and metadata from Git and UTC time", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-journal-"));
  roots.push(root);
  await run("git", ["init", "--quiet", "-b", "feature/context"], { cwd: root });
  await run("git", ["config", "user.name", "CCR Test"], { cwd: root });
  await run("git", ["config", "user.email", "ccr@example.test"], { cwd: root });
  await mkdir(path.join(root, ".ccr"));
  await writeFile(
    path.join(root, ".ccr/config.json"),
    `${JSON.stringify(DEFAULT_CONTEXT_CONFIG)}\n`,
    "utf8",
  );
  await writeFile(path.join(root, "file.txt"), "test\n", "utf8");
  await run("git", ["add", "file.txt"], { cwd: root });
  await run("git", ["commit", "--quiet", "-m", "test"], { cwd: root });

  const result = await createJournalEntry(root, new Date("2026-07-29T06:45:12Z"));
  const content = await readFile(path.join(root, result.path), "utf8");

  expect(result.path).toMatch(
    /^\.ccr\/journal\/feature_context-[0-9a-f]{8}\/2026-07-29T06-45-12Z\.md$/,
  );
  expect(content).toContain("2026-07-29T06:45:12Z");
  expect(content).toContain("feature/context");
  expect(content).toMatch(/\*\*Commit\*\*: `[0-9a-f]{40}`/);

  const newer = await createJournalEntry(root, new Date("2026-07-29T07:45:12Z"));
  const recent = await readRecentJournalEntries(root);
  expect(recent.map((entry) => entry.path)).toEqual([newer.path, result.path]);
});

it("should report journal existence per commit and record changed paths", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-journal-exists-"));
  roots.push(root);
  await run("git", ["init", "--quiet", "-b", "main"], { cwd: root });
  await run("git", ["config", "user.name", "CCR Test"], { cwd: root });
  await run("git", ["config", "user.email", "ccr@example.test"], { cwd: root });
  await mkdir(path.join(root, ".ccr"));
  await writeFile(path.join(root, "main.py"), "print(1)\n", "utf8");
  await run("git", ["add", "main.py"], { cwd: root });
  await run("git", ["commit", "--quiet", "-m", "first"], { cwd: root });
  const commit = (await run("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  const otherCommit = "0".repeat(40);

  expect(await journalEntryExistsForCommit(root, commit)).toBe(false);
  expect(await journalEntryExistsForCommit(root, otherCommit)).toBe(false);

  const result = await createJournalEntry(root, new Date("2026-07-29T09:00:00Z"), ["main.py"]);
  const content = await readFile(path.join(root, result.path), "utf8");
  expect(content).toContain(`**Commit**: \`${commit}\``);
  expect(content).toContain("- main.py");
  expect(content).not.toContain("None recorded.");

  expect(await journalEntryExistsForCommit(root, commit)).toBe(true);
  expect(await journalEntryExistsForCommit(root, otherCommit)).toBe(false);
});

it("should not overwrite a journal entry created in the same second", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-journal-collision-"));
  roots.push(root);
  await run("git", ["init", "--quiet", "-b", "main"], { cwd: root });
  await run("git", ["config", "user.name", "CCR Test"], { cwd: root });
  await run("git", ["config", "user.email", "ccr@example.test"], { cwd: root });
  await mkdir(path.join(root, ".ccr"));
  await writeFile(
    path.join(root, ".ccr/config.json"),
    `${JSON.stringify(DEFAULT_CONTEXT_CONFIG)}\n`,
    "utf8",
  );
  await writeFile(path.join(root, "file.txt"), "test\n", "utf8");
  await run("git", ["add", "file.txt"], { cwd: root });
  await run("git", ["commit", "--quiet", "-m", "test"], { cwd: root });

  const sameSecond = new Date("2026-07-29T10:00:00Z");
  const first = await createJournalEntry(root, sameSecond);
  const second = await createJournalEntry(root, sameSecond);

  expect(second.path).not.toBe(first.path);
  for (const entry of [first, second]) {
    const content = await readFile(path.join(root, entry.path), "utf8");
    expect(content).toMatch(/\*\*Commit\*\*: `[0-9a-f]{40}`/);
  }

  const recent = await readRecentJournalEntries(root);
  expect(new Set(recent.map((entry) => entry.path))).toEqual(new Set([first.path, second.path]));
});
