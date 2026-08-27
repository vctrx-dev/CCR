import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTEXT_CONFIG, serializeContextConfig } from "../../../src/context/config";
import { readFilteredWorktreePathFingerprints } from "../../../src/context/git";
import {
  ensureJournalEntryForHead,
  ensurePullRequestJournalEntry,
  ensureWorkingJournalEntry,
} from "../../../src/context/journal";
import {
  computeReviewContextFingerprint,
  computeStagedReviewState,
  computeWorkingReviewState,
  readStagedReviewFreshness,
  recordWorkingReviewState,
} from "../../../src/review/review-state";
import { createTemporaryRootRegistry, runCommand } from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();

const COMPLETE_REVIEW_RUN = `## Review run — 2026-08-27T01:00:00Z

- **Scope**: changes
- **Dimensions**: all
- **Evidence**: approved live changes
- **Finding counts**: critical=0, high=0, medium=0, low=0
- **Outcomes**: no findings
`;

async function makeRepository(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-review-state-"));
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
  await writeFile(path.join(root, ".ccr/project.md"), "# Project\n\nInitial context.\n", "utf8");
  await writeFile(
    path.join(root, ".ccr/stakeholders.md"),
    "# Stakeholders\n\nInitial stakeholders.\n",
    "utf8",
  );
  await writeFile(path.join(root, ".ccr/decisions.md"), "", "utf8");
  await writeFile(path.join(root, "source.ts"), "export const value = 1;\n", "utf8");
  await runCommand("git", ["add", "--", ".ccr", "source.ts"], { cwd: root });
  await runCommand("git", ["commit", "--quiet", "-m", "test: seed"], { cwd: root });
  return root;
}

async function completeReviewJournal(root: string, journalPath: string): Promise<string> {
  const target = path.join(root, journalPath);
  const content = (await readFile(target, "utf8")).replace(
    "Needs concise completion.",
    "Reviewed approved repository evidence.",
  );
  await writeFile(target, `${content}\n${COMPLETE_REVIEW_RUN}`, "utf8");
  return target;
}

describe("review state", () => {
  it("should stay stable when reviewed work is staged and change after a later edit", async () => {
    const root = await makeRepository();
    await writeFile(path.join(root, "source.ts"), "export const value = 2;\n", "utf8");

    const reviewed = await computeWorkingReviewState(root);
    await runCommand("git", ["add", "--", "source.ts"], { cwd: root });

    expect((await computeStagedReviewState(root)).fingerprint).toBe(reviewed.fingerprint);

    await writeFile(path.join(root, "source.ts"), "export const value = 3;\n", "utf8");
    await runCommand("git", ["add", "--", "source.ts"], { cwd: root });

    expect((await computeStagedReviewState(root)).fingerprint).not.toBe(reviewed.fingerprint);
  });

  it("should compare worktree and index content after Git clean filters", async () => {
    const root = await makeRepository();
    await runCommand("git", ["config", "core.autocrlf", "true"], { cwd: root });
    await runCommand("git", ["config", "core.filemode", "true"], { cwd: root });
    await writeFile(path.join(root, "source.ts"), "export const value = 2;\r\n", "utf8");

    const reviewed = await computeWorkingReviewState(root);
    await runCommand("git", ["add", "--", "source.ts"], { cwd: root });

    expect((await computeStagedReviewState(root)).fingerprint).toBe(reviewed.fingerprint);
  });

  it("should bound filtered path hashing and represent a missing path", async () => {
    const root = await makeRepository();

    expect(readFilteredWorktreePathFingerprints(root, ["missing.ts"]).get("missing.ts")).toBe(
      "missing",
    );
    expect(() =>
      readFilteredWorktreePathFingerprints(
        root,
        Array.from({ length: 5_001 }, (_, index) => `file-${index}.ts`),
      ),
    ).toThrow("too many paths");
  });

  it("should preserve a deleted path across working and staged states", async () => {
    const root = await makeRepository();
    await runCommand("git", ["config", "core.filemode", "true"], { cwd: root });
    await rm(path.join(root, "source.ts"));

    const reviewed = await computeWorkingReviewState(root);
    await runCommand("git", ["add", "--", "source.ts"], { cwd: root });

    expect((await computeStagedReviewState(root)).fingerprint).toBe(reviewed.fingerprint);
  });

  it("should detect a staged executable-mode change with unchanged content", async () => {
    const root = await makeRepository();
    await writeFile(path.join(root, "source.ts"), "export const value = 2;\n", "utf8");
    await runCommand("git", ["add", "--", "source.ts"], { cwd: root });
    await runCommand("git", ["update-index", "--chmod=+x", "source.ts"], { cwd: root });
    const reviewed = await computeWorkingReviewState(root);

    await runCommand("git", ["update-index", "--chmod=-x", "source.ts"], { cwd: root });

    expect((await computeStagedReviewState(root)).fingerprint).not.toBe(reviewed.fingerprint);
  });

  it("should record the reviewed state in the review run and detect a stale commit candidate", async () => {
    const root = await makeRepository();
    await writeFile(path.join(root, "source.ts"), "export const value = 2;\n", "utf8");
    const reviewed = await computeWorkingReviewState(root);
    const journal = await ensureWorkingJournalEntry(root);
    const target = await completeReviewJournal(root, journal.path);

    await recordWorkingReviewState(
      root,
      journal.path,
      reviewed.fingerprint,
      reviewed.contextFingerprint,
    );
    expect(await readFile(target, "utf8")).toContain(
      `- **Reviewed state**: \`${reviewed.fingerprint}\``,
    );

    await writeFile(path.join(root, "source.ts"), "export const value = 3;\n", "utf8");
    await runCommand("git", ["add", "--", "source.ts"], { cwd: root });

    expect(await readStagedReviewFreshness(root)).toMatchObject({ status: "stale" });
  }, 15_000);

  it("should not fingerprint privacy-excluded changes", async () => {
    const root = await makeRepository();
    await writeFile(path.join(root, "source.ts"), "export const value = 2;\n", "utf8");
    await writeFile(path.join(root, ".env"), "TOKEN=first\n", "utf8");
    const before = await computeWorkingReviewState(root);

    await writeFile(path.join(root, ".env"), "TOKEN=second\n", "utf8");
    const after = await computeWorkingReviewState(root);

    expect(after).toEqual(before);
    expect(after.pathCount).toBe(1);
  });

  it("should reject recording after the reviewed evidence changes", async () => {
    const root = await makeRepository();
    await writeFile(path.join(root, "source.ts"), "export const value = 2;\n", "utf8");
    const reviewed = await computeWorkingReviewState(root);
    const journal = await ensureWorkingJournalEntry(root);
    await completeReviewJournal(root, journal.path);
    await writeFile(path.join(root, "source.ts"), "export const value = 3;\n", "utf8");

    await expect(
      recordWorkingReviewState(
        root,
        journal.path,
        reviewed.fingerprint,
        reviewed.contextFingerprint,
      ),
    ).rejects.toThrow("Review evidence changed");
  }, 15_000);

  it("should detect edits made after a clean codebase review", async () => {
    const root = await makeRepository();
    const reviewed = await computeWorkingReviewState(root);
    const journal = await ensureJournalEntryForHead(root);
    await completeReviewJournal(root, journal.path);
    await recordWorkingReviewState(
      root,
      journal.path,
      reviewed.fingerprint,
      reviewed.contextFingerprint,
    );
    await writeFile(path.join(root, "source.ts"), "export const value = 2;\n", "utf8");
    await runCommand("git", ["add", "--", "source.ts"], { cwd: root });

    expect(await readStagedReviewFreshness(root)).toMatchObject({
      status: "stale",
      journalPath: journal.path,
    });
  }, 15_000);

  it("should reject an oversized journal before retaining or rewriting it", async () => {
    const root = await makeRepository();
    await writeFile(path.join(root, "source.ts"), "export const value = 2;\n", "utf8");
    const reviewed = await computeWorkingReviewState(root);
    const journal = await ensureWorkingJournalEntry(root);
    const skeleton = await readFile(path.join(root, journal.path), "utf8");
    await writeFile(
      path.join(root, journal.path),
      `${skeleton.replace("Needs concise completion.", "Reviewed changes.")}\n${COMPLETE_REVIEW_RUN}\n${"x".repeat(64_001)}`,
      "utf8",
    );

    await expect(
      recordWorkingReviewState(
        root,
        journal.path,
        reviewed.fingerprint,
        reviewed.contextFingerprint,
      ),
    ).rejects.toThrow("exceeds 64000 characters");
  }, 15_000);

  it("should reject a journal outside the current branch and repository state", async () => {
    const root = await makeRepository();
    await writeFile(path.join(root, "source.ts"), "export const value = 2;\n", "utf8");
    const reviewed = await computeWorkingReviewState(root);
    const pullRequestJournal = await ensurePullRequestJournalEntry(root, 42);
    await completeReviewJournal(root, pullRequestJournal.path);

    await expect(
      recordWorkingReviewState(
        root,
        pullRequestJournal.path,
        reviewed.fingerprint,
        reviewed.contextFingerprint,
      ),
    ).rejects.toThrow("current review journal");

    await runCommand("git", ["switch", "--quiet", "-c", "other"], { cwd: root });
    const otherBranchJournal = await ensureWorkingJournalEntry(root);
    await completeReviewJournal(root, otherBranchJournal.path);
    await runCommand("git", ["switch", "--quiet", "main"], { cwd: root });

    await expect(
      recordWorkingReviewState(
        root,
        otherBranchJournal.path,
        reviewed.fingerprint,
        reviewed.contextFingerprint,
      ),
    ).rejects.toThrow("current review journal");

    await runCommand("git", ["add", "--", "source.ts"], { cwd: root });
    await runCommand("git", ["commit", "--quiet", "-m", "test: advance head"], { cwd: root });
    await writeFile(path.join(root, "source.ts"), "export const value = 3;\n", "utf8");
    const current = await computeWorkingReviewState(root);

    await expect(
      recordWorkingReviewState(
        root,
        otherBranchJournal.path,
        current.fingerprint,
        current.contextFingerprint,
      ),
    ).rejects.toThrow("current review journal");
  }, 15_000);

  it("should reject unresolved or structurally incomplete review continuity", async () => {
    const root = await makeRepository();
    await writeFile(path.join(root, "source.ts"), "export const value = 2;\n", "utf8");
    const reviewed = await computeWorkingReviewState(root);
    const journal = await ensureWorkingJournalEntry(root);
    const target = path.join(root, journal.path);
    const skeleton = await readFile(target, "utf8");
    await writeFile(target, `${skeleton}\n${COMPLETE_REVIEW_RUN}`, "utf8");

    await expect(
      recordWorkingReviewState(
        root,
        journal.path,
        reviewed.fingerprint,
        reviewed.contextFingerprint,
      ),
    ).rejects.toThrow("completion placeholder");

    await writeFile(
      target,
      `${skeleton.replace("Needs concise completion.", "Reviewed changes.")}\n## Review run — 2026-08-27T01:00:00Z\n\n- **Scope**: changes\n`,
      "utf8",
    );
    await expect(
      recordWorkingReviewState(
        root,
        journal.path,
        reviewed.fingerprint,
        reviewed.contextFingerprint,
      ),
    ).rejects.toThrow("review continuity is incomplete");

    await writeFile(
      target,
      `${await readFile(target, "utf8")}\n- **Reviewed state**: \`${reviewed.fingerprint}\`\n- **Reviewed context**: \`${reviewed.contextFingerprint}\`\n- **Review status**: current\n`,
      "utf8",
    );
    expect(await readStagedReviewFreshness(root)).toMatchObject({ status: "unrecorded" });
  }, 15_000);

  it("should fingerprint review context separately and reject an unverified context change", async () => {
    const root = await makeRepository();
    await writeFile(path.join(root, "source.ts"), "export const value = 2;\n", "utf8");
    const initial = await computeWorkingReviewState(root);
    expect(await computeReviewContextFingerprint(root)).toBe(initial.contextFingerprint);
    await writeFile(
      path.join(root, ".ccr/stakeholders.md"),
      "# Stakeholders\n\nChanged while review was running.\n",
      "utf8",
    );
    const changed = await computeWorkingReviewState(root);
    expect(changed.fingerprint).toBe(initial.fingerprint);
    expect(changed.contextFingerprint).not.toBe(initial.contextFingerprint);
    const journal = await ensureWorkingJournalEntry(root);
    await completeReviewJournal(root, journal.path);

    await expect(
      recordWorkingReviewState(root, journal.path, initial.fingerprint, initial.contextFingerprint),
    ).rejects.toThrow("Review context changed");
  });

  it("should reject oversized shared context instead of hashing a truncated prefix", async () => {
    const root = await makeRepository();
    await writeFile(
      path.join(root, ".ccr/project.md"),
      `# Project\n\n${"x".repeat(10_001)}`,
      "utf8",
    );

    await expect(computeReviewContextFingerprint(root)).rejects.toThrow(
      "Review context exceeds 10000 characters",
    );
  });

  it("should distinguish missing context from text and reject malformed UTF-8", async () => {
    const root = await makeRepository();
    const decisionsPath = path.join(root, ".ccr/decisions.md");
    await rm(decisionsPath);
    const missing = await computeReviewContextFingerprint(root);
    await writeFile(decisionsPath, "missing", "utf8");
    expect(await computeReviewContextFingerprint(root)).not.toBe(missing);
    await writeFile(decisionsPath, Buffer.from([0xff]));

    await expect(computeReviewContextFingerprint(root)).rejects.toThrow("not valid UTF-8 text");
  });

  it("should record authorized project and decision writes without code-evidence drift", async () => {
    const root = await makeRepository();
    await writeFile(path.join(root, "source.ts"), "export const value = 2;\n", "utf8");
    const initial = await computeWorkingReviewState(root);
    await writeFile(path.join(root, ".ccr/project.md"), "# Project\n\nVerified update.\n", "utf8");
    await writeFile(path.join(root, ".ccr/decisions.md"), "- Durable choice.\n", "utf8");
    const final = await computeWorkingReviewState(root);
    expect(final.fingerprint).toBe(initial.fingerprint);
    expect(final.contextFingerprint).not.toBe(initial.contextFingerprint);
    const journal = await ensureWorkingJournalEntry(root);
    const target = await completeReviewJournal(root, journal.path);

    await recordWorkingReviewState(root, journal.path, final.fingerprint, final.contextFingerprint);
    await runCommand("git", ["add", "--", "source.ts"], { cwd: root });

    expect(await readFile(target, "utf8")).toContain(
      `- **Reviewed context**: \`${final.contextFingerprint}\``,
    );
    expect(await readStagedReviewFreshness(root)).toMatchObject({ status: "current" });
  }, 15_000);

  it("should record only the latest complete review run and reject duplicate record metadata", async () => {
    const root = await makeRepository();
    await writeFile(path.join(root, "source.ts"), "export const value = 2;\n", "utf8");
    const reviewed = await computeWorkingReviewState(root);
    const journal = await ensureWorkingJournalEntry(root);
    const target = await completeReviewJournal(root, journal.path);
    await writeFile(
      target,
      `${await readFile(target, "utf8")}\n${COMPLETE_REVIEW_RUN.replace("01:00:00Z", "02:00:00Z")}`,
      "utf8",
    );

    await recordWorkingReviewState(
      root,
      journal.path,
      reviewed.fingerprint,
      reviewed.contextFingerprint,
    );
    const recorded = await readFile(target, "utf8");
    expect(recorded.match(/\*\*Reviewed state\*\*/gu)).toHaveLength(1);
    expect(recorded.lastIndexOf("**Reviewed state**")).toBeGreaterThan(
      recorded.lastIndexOf("## Review run —"),
    );

    await writeFile(
      target,
      recorded.replace(
        "- **Review status**: current",
        "- **Review status**: current\n- **Review status**: current",
      ),
      "utf8",
    );
    expect(await readStagedReviewFreshness(root)).toMatchObject({ status: "unrecorded" });
  }, 15_000);
});
