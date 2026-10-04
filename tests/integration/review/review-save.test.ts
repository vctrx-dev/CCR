import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTEXT_CONFIG, serializeContextConfig } from "../../../src/context/config";
import {
  ensurePullRequestJournalEntry,
  ensureWorkingJournalEntry,
} from "../../../src/context/journal";
import { saveReview } from "../../../src/review/review-save";
import {
  computeReviewContextState,
  computeWorkingReviewState,
  readStagedReviewFreshness,
  recordWorkingReviewState,
} from "../../../src/review/review-state";
import { createTemporaryRootRegistry, runCommand } from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();

async function makeRepository(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-review-save-"));
  roots.push(root);
  await runCommand("git", ["init", "--quiet", "-b", "main"], { cwd: root });
  await runCommand("git", ["config", "user.name", "CCR Test"], { cwd: root });
  await runCommand("git", ["config", "user.email", "ccr@example.test"], { cwd: root });
  await mkdir(path.join(root, ".ccr"), { recursive: true });
  await writeFile(
    path.join(root, ".ccr/config.json"),
    serializeContextConfig(DEFAULT_CONTEXT_CONFIG),
    "utf8",
  );
  await writeFile(path.join(root, ".ccr/project.md"), "# Project\n", "utf8");
  await writeFile(path.join(root, ".ccr/stakeholders.md"), "# Stakeholders\n", "utf8");
  await writeFile(path.join(root, ".ccr/decisions.md"), "", "utf8");
  await writeFile(path.join(root, "source.ts"), "export const value = 1;\n", "utf8");
  await runCommand("git", ["add", "--", ".ccr", "source.ts"], { cwd: root });
  await runCommand("git", ["commit", "--quiet", "-m", "test: seed"], { cwd: root });
  return root;
}

const input = {
  scope: "changes",
  dimensions: "all",
  counts: "0,1,0,2",
  summary: "Reviewed the grading change; one high finding.",
};
const now = new Date("2026-09-16T10:00:00Z");

describe("save review", () => {
  it("should complete the change journal and record a current review state", async () => {
    const root = await makeRepository();
    await writeFile(path.join(root, "source.ts"), "export const value = 2;\n", "utf8");

    const saved = await saveReview(root, input, now);
    const content = await readFile(path.join(root, saved.path), "utf8");

    expect(saved.isRecorded).toBe(true);
    expect(content).not.toContain("Needs concise completion.");
    expect(content).toContain("critical=0, high=1, medium=0, low=2");
    expect(content).toContain("- **Review status**: current");
    await runCommand("git", ["add", "--", "source.ts"], { cwd: root });
    expect((await readStagedReviewFreshness(root)).status).toBe("current");
  });

  it("should journal a pull request review without recording local state", async () => {
    const root = await makeRepository();

    const saved = await saveReview(root, { ...input, scope: "pr-7" }, now);
    const content = await readFile(path.join(root, saved.path), "utf8");

    expect(saved.isRecorded).toBe(false);
    expect(content).toContain("- **Scope**: PR-7");
    expect(content).not.toContain("Review status");
  });

  it("should refuse to save when code changed after the reviewer captured its state", async () => {
    const root = await makeRepository();
    await writeFile(path.join(root, "source.ts"), "export const value = 2;\n", "utf8");
    const reviewed = await computeWorkingReviewState(root);
    await writeFile(path.join(root, "source.ts"), "export const value = 3;\n", "utf8");
    const expected = {
      expectedState: reviewed.fingerprint,
      expectedContext: reviewed.contextFingerprint,
    };

    await expect(saveReview(root, { ...input, ...expected }, now)).rejects.toThrow(
      "changed since review-state was captured",
    );
    await expect(readdir(path.join(root, ".ccr/journal"))).rejects.toThrow();

    await writeFile(path.join(root, "source.ts"), "export const value = 2;\n", "utf8");
    const saved = await saveReview(root, { ...input, ...expected }, now);
    expect(saved.isRecorded).toBe(true);
    await expect(saveReview(root, { ...input, ...expected, scope: "PR-7" }, now)).rejects.toThrow(
      "apply only to changes and codebase",
    );
  });

  it("should re-record a review after context-only edits but never after code changes", async () => {
    const root = await makeRepository();
    await writeFile(path.join(root, "source.ts"), "export const value = 2;\n", "utf8");
    const saved = await saveReview(root, input, now);
    await runCommand("git", ["add", "--", "source.ts"], { cwd: root });
    await writeFile(
      path.join(root, ".ccr/decisions.md"),
      "- Drafts stay human-reviewed.\n",
      "utf8",
    );
    expect((await readStagedReviewFreshness(root)).status).toBe("stale");

    const contextOnly = await computeWorkingReviewState(root);
    await recordWorkingReviewState(
      root,
      saved.path,
      contextOnly.fingerprint,
      contextOnly.contextFingerprint,
    );
    expect((await readStagedReviewFreshness(root)).status).toBe("current");

    await writeFile(path.join(root, "source.ts"), "export const value = 3;\n", "utf8");
    const changedCode = await computeWorkingReviewState(root);
    await expect(
      recordWorkingReviewState(
        root,
        saved.path,
        changedCode.fingerprint,
        changedCode.contextFingerprint,
      ),
    ).rejects.toThrow("Code changed since this review was recorded");
  });

  it("should reject unacknowledged journal feedback before any save mutation", async () => {
    const root = await makeRepository();
    await writeFile(path.join(root, "source.ts"), "export const value = 2;\n");
    const journal = await ensureWorkingJournalEntry(root, now);
    const reviewed = await computeWorkingReviewState(root);
    const file = path.join(root, journal.path);
    const corrected = `${await readFile(file, "utf8")}\nHuman correction: the appeal route is unavailable.\n`;
    await writeFile(file, corrected);
    const expected = {
      expectedState: reviewed.fingerprint,
      expectedContext: reviewed.contextFingerprint,
      expectedInputContext: reviewed.inputContextFingerprint,
    };

    await expect(saveReview(root, { ...input, ...expected }, now)).rejects.toThrow(
      "Review journal inputs changed",
    );
    expect(await readFile(file, "utf8")).toBe(corrected);
    const acknowledged = await computeWorkingReviewState(root);
    const saved = await saveReview(
      root,
      {
        ...input,
        ...expected,
        expectedInputContext: acknowledged.inputContextFingerprint,
      },
      now,
    );
    expect(saved.isRecorded).toBe(true);
    expect(await readFile(file, "utf8")).toContain("Human correction");
  });

  it("should check acknowledged inputs before creating the first journal", async () => {
    const root = await makeRepository();
    const reviewed = await computeWorkingReviewState(root);
    const saved = await saveReview(
      root,
      {
        ...input,
        scope: "codebase",
        expectedState: reviewed.fingerprint,
        expectedContext: reviewed.contextFingerprint,
        expectedInputContext: reviewed.inputContextFingerprint,
      },
      now,
    );
    expect(saved.isRecorded).toBe(true);
  });

  it("should reject shared-context drift without creating a review journal", async () => {
    const root = await makeRepository();
    const reviewed = await computeWorkingReviewState(root);
    await writeFile(path.join(root, ".ccr/project.md"), "# Project\n\nChanged product rule.\n");
    await expect(
      saveReview(
        root,
        {
          ...input,
          expectedState: reviewed.fingerprint,
          expectedContext: reviewed.contextFingerprint,
        },
        now,
      ),
    ).rejects.toThrow("Review context changed");
    await expect(readdir(path.join(root, ".ccr/journal"))).rejects.toThrow();
  });

  it("should validate acknowledged PR inputs without recording local freshness", async () => {
    const root = await makeRepository();
    const journal = await ensurePullRequestJournalEntry(root, 7, now);
    const before = await computeReviewContextState(root, 7);
    const file = path.join(root, journal.path);
    const corrected = `${await readFile(file, "utf8")}\nHuman clarification: this is only a draft.\n`;
    await writeFile(file, corrected);
    await expect(
      saveReview(
        root,
        {
          ...input,
          scope: "PR-7",
          expectedInputContext: before.inputContextFingerprint,
        },
        now,
      ),
    ).rejects.toThrow("Review journal inputs changed");
    expect(await readFile(file, "utf8")).toBe(corrected);
    const acknowledged = await computeReviewContextState(root, 7);
    const saved = await saveReview(
      root,
      {
        ...input,
        scope: "PR-7",
        expectedInputContext: acknowledged.inputContextFingerprint,
      },
      now,
    );
    expect(saved).toEqual({ path: journal.path, isRecorded: false });
    expect(await readFile(file, "utf8")).not.toContain("Reviewed state");
  });

  it("should reject malformed scope, counts, and multi-line summaries before writing", async () => {
    const root = await makeRepository();
    for (const bad of [
      { ...input, scope: "everything" },
      { ...input, counts: "1,2" },
      { ...input, summary: "line one\nline two" },
      { ...input, summary: "x".repeat(501) },
    ]) {
      await expect(saveReview(root, bad, now)).rejects.toThrow();
    }
    await expect(readFile(path.join(root, ".ccr/journal"), "utf8")).rejects.toThrow();
  });
});
