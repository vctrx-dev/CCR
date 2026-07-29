import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";
import { DEFAULT_CONTEXT_CONFIG } from "../../../src/context/config";
import { createJournalEntry, readRecentJournalEntries } from "../../../src/context/journal";

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
