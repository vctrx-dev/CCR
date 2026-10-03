import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { DEFAULT_CONTEXT_CONFIG, serializeContextConfig } from "../../../src/context/config";
import { withJournalMutationLock } from "../../../src/context/journal-lock";
import {
  readRecentJournalEntries,
  readReviewJournalEntriesWhileLocked,
} from "../../../src/context/journal-recency";
import { createTemporaryRootRegistry, runCommand } from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();

it("should include an older active journal without displacing recent history or copying it into continuity", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-active-memory-"));
  roots.push(root);
  await mkdir(path.join(root, ".ccr/journal/main"), { recursive: true });
  const paths: string[] = [];
  for (const day of [20, 21, 22, 23]) {
    const relativePath = `.ccr/journal/main/2026-08-${day}.md`;
    paths.push(relativePath);
    await writeFile(
      path.join(root, relativePath),
      `# CCR Journal\n\n- **Started**: 2026-08-${day}T01:00:00Z\n- **Updated**: 2026-08-${day}T01:00:00Z\n\n## Summary\nMemory ${day}.\n`,
    );
  }
  const result = await withJournalMutationLock(root, () =>
    readReviewJournalEntriesWhileLocked(root, 3, paths[0]),
  );
  expect(result.inputEntries.map((entry) => entry.path)).toEqual([
    paths[0],
    paths[3],
    paths[2],
    paths[1],
  ]);
  expect(result.continuityEntries.map((entry) => entry.path)).toEqual([
    paths[3],
    paths[2],
    paths[1],
  ]);
  const recent = await withJournalMutationLock(root, () =>
    readReviewJournalEntriesWhileLocked(root, 3, paths[3]),
  );
  expect(recent.inputEntries.map((entry) => entry.path)).toEqual([
    paths[3],
    paths[2],
    paths[1],
    paths[0],
  ]);
  expect(recent.continuityEntries.map((entry) => entry.path)).toEqual([
    paths[2],
    paths[1],
    paths[0],
  ]);
});

it("should apply the configured count after repository-wide Updated ordering", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-journal-recency-"));
  roots.push(root);
  await runCommand("git", ["init", "--quiet", "-b", "main"], { cwd: root });
  await mkdir(path.join(root, ".ccr/journal/older-branch"), { recursive: true });
  await mkdir(path.join(root, ".ccr/journal/pull-request-42"), { recursive: true });
  await writeFile(
    path.join(root, ".ccr/config.json"),
    serializeContextConfig({
      ...DEFAULT_CONTEXT_CONFIG,
      context: { ...DEFAULT_CONTEXT_CONFIG.context, recentJournalEntries: 1 },
    }),
    "utf8",
  );
  const journal = (updated: string, metadata: string) =>
    `# CCR Journal\n\n- **Started**: 2026-08-20T01:00:00Z\n- **Updated**: ${updated}\n${metadata}\n\n## Summary\n\nCompleted.\n`;
  const latestPath = path.join(root, ".ccr/journal/older-branch/2026-08-20.md");
  await writeFile(
    latestPath,
    journal(
      "2026-08-27T05:00:00Z",
      `- **Branch**: \`older-branch\`\n- **Commit**: \`${"a".repeat(40)}\``,
    ),
    "utf8",
  );
  await writeFile(
    path.join(root, ".ccr/journal/pull-request-42/2026-08-27.md"),
    journal("2026-08-27T04:00:00Z", "- **Pull request**: `PR-42`"),
    "utf8",
  );

  await expect(readRecentJournalEntries(root)).resolves.toEqual([
    expect.objectContaining({
      path: ".ccr/journal/older-branch/2026-08-20.md",
    }),
  ]);
});

it("should ignore activity examples in the body and order legacy Timestamp as its activity", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-journal-recency-legacy-"));
  roots.push(root);
  await runCommand("git", ["init", "--quiet", "-b", "main"], { cwd: root });
  await mkdir(path.join(root, ".ccr/journal/main"), { recursive: true });
  await mkdir(path.join(root, ".ccr/journal/older"), { recursive: true });
  await writeFile(
    path.join(root, ".ccr/config.json"),
    serializeContextConfig({
      ...DEFAULT_CONTEXT_CONFIG,
      context: { ...DEFAULT_CONTEXT_CONFIG.context, recentJournalEntries: 2 },
    }),
    "utf8",
  );
  const legacyPath = ".ccr/journal/older/2026-08-20.md";
  await writeFile(
    path.join(root, legacyPath),
    "# CCR Journal\n\n- **Timestamp**: 2026-08-27T04:00:00Z\n- **Base commit**: `unborn`\n\n## Summary\n\nLegacy entry.\n",
    "utf8",
  );
  const currentPath = ".ccr/journal/main/2026-08-27.md";
  await writeFile(
    path.join(root, currentPath),
    "# CCR Journal\n\n- **Started**: 2026-08-27T01:00:00Z\n- **Updated**: 2026-08-27T03:00:00Z\n- **Base commit**: `unborn`\n\n## Summary\n\nExample only:\n- **Updated**: 2026-08-27T09:00:00Z\n",
    "utf8",
  );

  await expect(readRecentJournalEntries(root)).resolves.toEqual([
    expect.objectContaining({ path: legacyPath }),
    expect.objectContaining({ path: currentPath }),
  ]);
});

it("should break equal Updated ties by Started and then stable path", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-journal-recency-tie-"));
  roots.push(root);
  await runCommand("git", ["init", "--quiet", "-b", "main"], { cwd: root });
  for (const directory of ["a", "b", "c"]) {
    await mkdir(path.join(root, ".ccr/journal", directory), { recursive: true });
  }
  await writeFile(
    path.join(root, ".ccr/config.json"),
    serializeContextConfig({
      ...DEFAULT_CONTEXT_CONFIG,
      context: { ...DEFAULT_CONTEXT_CONFIG.context, recentJournalEntries: 2 },
    }),
    "utf8",
  );
  const journal = (started: string) =>
    `# CCR Journal\n\n- **Started**: ${started}\n- **Updated**: 2026-08-27T05:00:00Z\n- **Base commit**: \`unborn\`\n\n## Summary\n\nCompleted.\n`;
  await writeFile(
    path.join(root, ".ccr/journal/a/2026-08-27.md"),
    journal("2026-08-27T02:00:00Z"),
    "utf8",
  );
  await writeFile(
    path.join(root, ".ccr/journal/b/2026-08-27.md"),
    journal("2026-08-27T02:00:00Z"),
    "utf8",
  );
  await writeFile(
    path.join(root, ".ccr/journal/c/2026-08-27.md"),
    journal("2026-08-27T01:00:00Z"),
    "utf8",
  );

  await expect(readRecentJournalEntries(root)).resolves.toEqual([
    expect.objectContaining({ path: ".ccr/journal/a/2026-08-27.md" }),
    expect.objectContaining({ path: ".ccr/journal/b/2026-08-27.md" }),
  ]);
});

it("should skip untouched placeholder journals so real history keeps the recent slot", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-journal-recency-placeholder-"));
  roots.push(root);
  await mkdir(path.join(root, ".ccr/journal/main"), { recursive: true });
  const reviewedPath = ".ccr/journal/main/2026-08-20.md";
  await writeFile(
    path.join(root, reviewedPath),
    "# CCR Journal\n\n- **Started**: 2026-08-20T01:00:00Z\n- **Updated**: 2026-08-20T01:00:00Z\n\n## Summary\n\nReviewed sign-up.\n",
  );
  await writeFile(
    path.join(root, ".ccr/journal/main/2026-08-21.md"),
    "# CCR Journal\n\n- **Started**: 2026-08-21T01:00:00Z\n- **Updated**: 2026-08-21T01:00:00Z\n\n## Summary\n\nNeeds concise completion.\n\n## Continuation\n\n### Summary\n\nReviewed sign-up.\n",
  );

  const result = await withJournalMutationLock(root, () =>
    readReviewJournalEntriesWhileLocked(root, 1),
  );

  expect(result.continuityEntries.map(({ path: entryPath }) => entryPath)).toEqual([reviewedPath]);
});
