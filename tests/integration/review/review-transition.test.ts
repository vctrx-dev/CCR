import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import { createCli } from "../../../src/cli/index";
import { DEFAULT_CONTEXT_CONFIG, serializeContextConfig } from "../../../src/context/config";
import { ensureWorkingJournalEntry } from "../../../src/context/journal";
import { saveReview } from "../../../src/review/review-save";
import {
  computeWorkingReviewState,
  readStagedReviewFreshness,
} from "../../../src/review/review-state";
import {
  createTemporaryGitRepository,
  createTemporaryRootRegistry,
  runCommand,
} from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();
const now = new Date("2026-09-16T10:00:00Z");

async function makeRepository() {
  const root = await createTemporaryGitRepository(roots, "ccr-review-transition-", "main");
  await mkdir(path.join(root, ".ccr"));
  await writeFile(
    path.join(root, ".ccr/config.json"),
    serializeContextConfig(DEFAULT_CONTEXT_CONFIG),
  );
  await writeFile(path.join(root, ".ccr/project.md"), "# Project\n");
  await writeFile(path.join(root, "source.ts"), "export const value = 1;\n");
  await runCommand("git", ["add", "--", ".ccr", "source.ts"], { cwd: root });
  await runCommand("git", ["commit", "--quiet", "-m", "test: seed"], { cwd: root });
  const saved = await saveReview(
    root,
    {
      scope: "codebase",
      dimensions: "all",
      counts: "0,1,0,0",
      summary: "Reviewed existing product rules.",
    },
    now,
  );
  return { root, saved };
}

async function continueThroughCli(root: string, target: string, source: string) {
  const state = await computeWorkingReviewState(root);
  const cli = createCli({ cwd: root, write() {} });
  cli.exitOverride();
  await cli.parseAsync([
    "node",
    "ccr",
    "context",
    "record-review-state",
    target,
    state.fingerprint,
    state.contextFingerprint,
    "--continue-from",
    source,
  ]);
}

it("should continue a clean-HEAD review through its own context-only edit without a new review run", async () => {
  const { root, saved } = await makeRepository();
  const sourceBefore = await readFile(path.join(root, saved.path), "utf8");
  await writeFile(
    path.join(root, ".ccr/project.md"),
    "# Project\n\nVerified clarification: appeals exist.\n",
  );
  const working = await ensureWorkingJournalEntry(root, now);
  const target = path.join(root, working.path);
  const narrative = (await readFile(target, "utf8")).replace(
    "Needs concise completion.",
    "Human clarified appeal access.",
  );
  await writeFile(target, narrative);

  await continueThroughCli(root, working.path, saved.path);
  const continued = await readFile(target, "utf8");
  expect(await readFile(path.join(root, saved.path), "utf8")).toBe(sourceBefore);
  expect(continued).toContain("Human clarified appeal access.");
  expect(continued).toContain(saved.path);
  expect(continued.match(/^## Review run — /gmu)).toHaveLength(1);
  expect(continued).toContain("## Review run — 2026-09-16T10:00:00Z");
  expect(continued).toContain("- **Scope**: codebase");
  expect((await readStagedReviewFreshness(root)).status).toBe("current");
  const once = await readFile(target, "utf8");
  await expect(continueThroughCli(root, working.path, saved.path)).rejects.toThrow(
    "already contains a review run",
  );
  expect(await readFile(target, "utf8")).toBe(once);
});

it("should refuse continuation after code changes without touching either journal", async () => {
  const { root, saved } = await makeRepository();
  await writeFile(path.join(root, "source.ts"), "export const value = 2;\n");
  const working = await ensureWorkingJournalEntry(root, now);
  const source = await readFile(path.join(root, saved.path), "utf8");
  const target = await readFile(path.join(root, working.path), "utf8");
  await expect(continueThroughCli(root, working.path, saved.path)).rejects.toThrow(
    "Code changed since this review",
  );
  expect(await readFile(path.join(root, saved.path), "utf8")).toBe(source);
  expect(await readFile(path.join(root, working.path), "utf8")).toBe(target);
});

it("should refuse a source from another branch or an older HEAD", async () => {
  const { root, saved } = await makeRepository();
  await runCommand("git", ["switch", "--quiet", "-c", "other"], { cwd: root });
  await writeFile(path.join(root, ".ccr/project.md"), "# Project\n\nClarification.\n");
  const other = await ensureWorkingJournalEntry(root, now);
  await expect(continueThroughCli(root, other.path, saved.path)).rejects.toThrow(
    "current HEAD journal",
  );
  await runCommand("git", ["switch", "--quiet", "main"], { cwd: root });
  await runCommand("git", ["add", "--", ".ccr/project.md"], { cwd: root });
  await runCommand("git", ["commit", "--quiet", "-m", "test: advance"], { cwd: root });
  await writeFile(path.join(root, ".ccr/project.md"), "# Project\n\nAnother clarification.\n");
  const newer = await ensureWorkingJournalEntry(root, now);
  await expect(continueThroughCli(root, newer.path, saved.path)).rejects.toThrow(
    "current HEAD journal",
  );
});
