import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AFTER_COMMIT_PROMPT, runAfterCommitCheck } from "../../../src/context/after-commit";
import { DEFAULT_CONTEXT_CONFIG, serializeContextConfig } from "../../../src/context/config";
import {
  ensureJournalEntryForHead,
  ensureWorkingJournalEntry,
  readRecentJournalEntries,
} from "../../../src/context/journal";
import {
  computeWorkingReviewState,
  recordWorkingReviewState,
} from "../../../src/review/review-state";
import { createTemporaryRootRegistry, runCommand } from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();

async function makeRepository(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-after-commit-"));
  roots.push(root);
  await runCommand("git", ["init", "--quiet", "-b", "main"], { cwd: root });
  await runCommand("git", ["config", "user.name", "CCR Test"], { cwd: root });
  await runCommand("git", ["config", "user.email", "ccr@example.test"], { cwd: root });
  return root;
}

async function commitPath(root: string, relativePath: string, content: string): Promise<void> {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
  await runCommand("git", ["add", "--", relativePath], { cwd: root });
  await runCommand("git", ["commit", "--quiet", "-m", `commit ${relativePath}`], { cwd: root });
}

describe("runAfterCommitCheck", () => {
  it("should warn, start a journal entry, and emit a prompt when code changed without context", async () => {
    const root = await makeRepository();
    await commitPath(root, "main.py", "print('x')\n");

    const result = await runAfterCommitCheck(root);
    expect(result.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(result.journalCreated).toBe(true);
    expect(result.journalPath).toMatch(/^\.ccr\/journal\/main-[0-9a-f]{8}\/.*\.md$/);
    expect(result.shouldWarn).toBe(true);
    expect(result.prompt).toBe("/ccr-context update last commit");

    const journalPath = result.journalPath;
    if (journalPath === undefined) throw new Error("Expected a journal path.");
    const content = await readFile(path.join(root, journalPath), "utf8");
    expect(content).toContain(`**Commit**: \`${result.commit}\``);
    expect(content).not.toContain("## Changed paths");

    const second = await runAfterCommitCheck(root);
    expect(second.journalCreated).toBe(false);
    expect(second.journalPath).toBe(result.journalPath);
    expect(second.shouldWarn).toBe(true);
    expect(second.hasRepositoryChanges).toBe(true);
  });

  it("should not warn when the same commit also updated shared context", async () => {
    const root = await makeRepository();
    await mkdir(path.join(root, ".ccr"), { recursive: true });
    await writeFile(
      path.join(root, ".ccr/config.json"),
      serializeContextConfig(DEFAULT_CONTEXT_CONFIG),
      "utf8",
    );
    await writeFile(path.join(root, ".ccr/project.md"), "# Project\n", "utf8");
    await writeFile(path.join(root, "main.py"), "print('x')\n", "utf8");
    await runCommand("git", ["add", "."], { cwd: root });
    await runCommand("git", ["commit", "--quiet", "-m", "code and context"], { cwd: root });

    const result = await runAfterCommitCheck(root);
    expect(result.shouldWarn).toBe(false);
    expect(result.hasRepositoryChanges).toBe(true);
  });

  it("should keep a code-and-context commit retryable until its journal is complete", async () => {
    const root = await makeRepository();
    await mkdir(path.join(root, ".ccr"), { recursive: true });
    await writeFile(path.join(root, ".ccr/project.md"), "# Project\n", "utf8");
    await writeFile(path.join(root, "main.py"), "print('x')\n", "utf8");
    await runCommand("git", ["add", "."], { cwd: root });
    await runCommand("git", ["commit", "--quiet", "-m", "code and context"], { cwd: root });

    const first = await runAfterCommitCheck(root);
    expect(first.shouldWarn).toBe(false);
    expect(first.prompt).toBe(AFTER_COMMIT_PROMPT);
    const journalPath = first.journalPath;
    if (journalPath === undefined) throw new Error("Expected a journal path.");

    const retry = await runAfterCommitCheck(root);
    expect(retry.journalCreated).toBe(false);
    expect(retry.journalPath).toBe(journalPath);
    expect(retry.prompt).toBe(AFTER_COMMIT_PROMPT);

    const target = path.join(root, journalPath);
    await writeFile(
      target,
      (await readFile(target, "utf8")).replace("Needs concise completion.", "Updated context."),
      "utf8",
    );
    expect((await runAfterCommitCheck(root)).prompt).toBeUndefined();
  });

  it("should finalize the working journal instead of creating a second entry", async () => {
    const root = await makeRepository();
    await mkdir(path.join(root, ".ccr"), { recursive: true });
    await writeFile(
      path.join(root, ".ccr/config.json"),
      serializeContextConfig(DEFAULT_CONTEXT_CONFIG),
      "utf8",
    );
    await runCommand("git", ["add", ".ccr/config.json"], { cwd: root });
    await runCommand("git", ["commit", "--quiet", "-m", "seed config"], { cwd: root });
    const working = await ensureWorkingJournalEntry(root);
    await commitPath(root, "main.py", "print('x')\n");

    const result = await runAfterCommitCheck(root);

    expect(result.journalCreated).toBe(false);
    expect(result.journalPath).toBe(working.path);
    const entries = await readRecentJournalEntries(root);
    expect(entries.map((entry) => entry.path)).toEqual([working.path]);
    expect(entries[0]?.content).toContain(`**Commit**: \`${result.commit}\``);
  });

  it("should mark a recorded review stale when later code is included in the commit", async () => {
    const root = await makeRepository();
    await mkdir(path.join(root, ".ccr"), { recursive: true });
    await writeFile(
      path.join(root, ".ccr/config.json"),
      serializeContextConfig(DEFAULT_CONTEXT_CONFIG),
      "utf8",
    );
    await writeFile(path.join(root, "main.py"), "print('base')\n", "utf8");
    await runCommand("git", ["add", ".ccr/config.json", "main.py"], { cwd: root });
    await runCommand("git", ["commit", "--quiet", "-m", "seed"], { cwd: root });
    await writeFile(path.join(root, "main.py"), "print('reviewed')\n", "utf8");
    const state = await computeWorkingReviewState(root);
    const journal = await ensureWorkingJournalEntry(root);
    const journalTarget = path.join(root, journal.path);
    const completed = (await readFile(journalTarget, "utf8")).replace(
      "Needs concise completion.",
      "Reviewed approved repository evidence.",
    );
    await writeFile(
      journalTarget,
      `${completed}\n## Review run — 2026-08-27T01:00:00Z\n\n- **Scope**: changes\n- **Dimensions**: all\n- **Evidence**: approved live changes\n- **Finding counts**: critical=0, high=0, medium=0, low=0\n- **Outcomes**: no findings\n`,
      "utf8",
    );
    await recordWorkingReviewState(root, journal.path, state.fingerprint, state.contextFingerprint);
    await writeFile(path.join(root, "main.py"), "print('changed after review')\n", "utf8");
    await runCommand("git", ["add", "main.py"], { cwd: root });
    await runCommand("git", ["commit", "--quiet", "-m", "change"], { cwd: root });

    const result = await runAfterCommitCheck(root);

    expect(result.reviewStatus).toBe("stale");
    expect(await readFile(journalTarget, "utf8")).toContain("- **Review status**: stale");
  }, 30_000);

  it("should preserve a current review when the committed code matches it", async () => {
    const root = await makeRepository();
    await mkdir(path.join(root, ".ccr"), { recursive: true });
    await writeFile(
      path.join(root, ".ccr/config.json"),
      serializeContextConfig(DEFAULT_CONTEXT_CONFIG),
      "utf8",
    );
    await writeFile(path.join(root, "main.py"), "print('base')\n", "utf8");
    await runCommand("git", ["add", ".ccr/config.json", "main.py"], { cwd: root });
    await runCommand("git", ["commit", "--quiet", "-m", "seed"], { cwd: root });
    await writeFile(path.join(root, "main.py"), "print('reviewed')\n", "utf8");
    const state = await computeWorkingReviewState(root);
    const journal = await ensureWorkingJournalEntry(root);
    const journalTarget = path.join(root, journal.path);
    const completed = (await readFile(journalTarget, "utf8")).replace(
      "Needs concise completion.",
      "Reviewed approved repository evidence.",
    );
    await writeFile(
      journalTarget,
      `${completed}\n## Review run — 2026-08-27T01:00:00Z\n\n- **Scope**: changes\n- **Dimensions**: all\n- **Evidence**: approved live changes\n- **Finding counts**: critical=0, high=0, medium=0, low=0\n- **Outcomes**: no findings\n`,
      "utf8",
    );
    await recordWorkingReviewState(root, journal.path, state.fingerprint, state.contextFingerprint);
    await runCommand("git", ["add", "main.py"], { cwd: root });
    await runCommand("git", ["commit", "--quiet", "-m", "change"], { cwd: root });

    const result = await runAfterCommitCheck(root);

    expect(result.reviewStatus).toBe("current");
    expect(await readFile(journalTarget, "utf8")).toContain("- **Review status**: current");
  }, 30_000);

  it("should not attach a partial commit to a journal that still covers working changes", async () => {
    const root = await makeRepository();
    await mkdir(path.join(root, ".ccr"), { recursive: true });
    await writeFile(
      path.join(root, ".ccr/config.json"),
      serializeContextConfig(DEFAULT_CONTEXT_CONFIG),
      "utf8",
    );
    await runCommand("git", ["add", ".ccr/config.json"], { cwd: root });
    await runCommand("git", ["commit", "--quiet", "-m", "seed config"], { cwd: root });
    const working = await ensureWorkingJournalEntry(root);
    await writeFile(path.join(root, "committed.py"), "print('committed')\n", "utf8");
    await writeFile(path.join(root, "pending.py"), "print('pending')\n", "utf8");
    const state = await computeWorkingReviewState(root);
    const workingTarget = path.join(root, working.path);
    const completed = (await readFile(workingTarget, "utf8")).replace(
      "Needs concise completion.",
      "Reviewed approved repository evidence.",
    );
    await writeFile(
      workingTarget,
      `${completed}\n## Review run — 2026-08-27T01:00:00Z\n\n- **Scope**: changes\n- **Dimensions**: all\n- **Evidence**: approved live changes\n- **Finding counts**: critical=0, high=0, medium=0, low=0\n- **Outcomes**: no findings\n`,
      "utf8",
    );
    await recordWorkingReviewState(root, working.path, state.fingerprint, state.contextFingerprint);
    await runCommand("git", ["add", "committed.py"], { cwd: root });
    await runCommand("git", ["commit", "--quiet", "-m", "partial"], { cwd: root });

    const result = await runAfterCommitCheck(root);

    expect(result.journalCreated).toBe(true);
    expect(result.journalPath).not.toBe(working.path);
    const pendingContent = await readFile(path.join(root, working.path), "utf8");
    expect(pendingContent).not.toContain("**Commit**");
    expect(pendingContent).toContain("- **Review status**: stale");
    expect(result.reviewStatus).toBe("stale");

    const nextWorking = await ensureWorkingJournalEntry(root);
    expect(nextWorking.path).not.toBe(working.path);
    const nextContent = await readFile(path.join(root, nextWorking.path), "utf8");
    expect(nextContent).toContain(working.path);
    expect(nextContent).toContain("Reviewed approved repository evidence.");
    expect(nextContent).not.toContain("**Review status**");
    expect(nextContent).not.toContain("## Review run");
    const committedContent = await readFile(path.join(root, result.journalPath ?? ""), "utf8");
    expect(committedContent).toContain(working.path);
    expect(committedContent).toContain("Reviewed approved repository evidence.");
    expect(await ensureWorkingJournalEntry(root)).toEqual(nextWorking);
  }, 30_000);

  it("should carry bounded human continuity from clean HEAD through edits and commit", async () => {
    const root = await makeRepository();
    await commitPath(root, "main.py", "print('base')\n");
    const head = await ensureJournalEntryForHead(root);
    const target = path.join(root, head.path);
    await writeFile(
      target,
      (await readFile(target, "utf8")).replace(
        "Needs concise completion.",
        `People need a clear next step. ${"x".repeat(5_000)}TAIL`,
      ),
    );
    await writeFile(path.join(root, "main.py"), "print('edited')\n");
    const working = await ensureWorkingJournalEntry(root);
    const content = await readFile(path.join(root, working.path), "utf8");
    expect(content).toContain(head.path);
    expect(content).toContain("People need a clear next step.");
    expect(content).not.toContain("TAIL");
    expect(content.length).toBeLessThan(4_000);
    expect(content).not.toContain("**Commit**");
    await runCommand("git", ["add", "main.py"], { cwd: root });
    await runCommand("git", ["commit", "--quiet", "-m", "edit"], { cwd: root });
    const result = await runAfterCommitCheck(root);
    expect(result.journalPath).toBe(working.path);
    expect(result.reviewStatus).toBe("unrecorded");
    expect(await readFile(path.join(root, working.path), "utf8")).toContain(
      "People need a clear next step.",
    );
  }, 30_000);

  it("should carry review-run findings and human explanations without completion receipts", async () => {
    const root = await makeRepository();
    await commitPath(root, "main.py", "print('base')\n");
    const head = await ensureJournalEntryForHead(root);
    const target = path.join(root, head.path);
    await writeFile(
      target,
      `${(await readFile(target, "utf8")).replace("Needs concise completion.", "Reviewed participation.")}\n## Review run — 2026-09-01T12:00:00Z\n- **Scope**: codebase\n- **Reviewed state**: \`sha256:${"a".repeat(64)}\`\n- **Review status**: current\n\n### Findings and outcomes\nF7 questioned: educator confirms paper submissions are accepted.\n\n### Work and decisions\nHuman explanation: this accommodates learners without reliable connectivity.\n\n### Next steps\nCheck learners can discover the paper route.\n`,
    );
    await writeFile(path.join(root, "main.py"), "print('edited')\n");
    const working = await ensureWorkingJournalEntry(root);
    const content = await readFile(path.join(root, working.path), "utf8");
    expect(content).toContain("F7 questioned");
    expect(content).toContain("without reliable connectivity");
    expect(content).toContain("Check learners can discover the paper route.");
    expect(content).toContain(head.path);
    expect(content).not.toContain("**Reviewed state**");
    expect(content).not.toContain("**Review status**");
  });

  it("should create committed metadata and not prompt for a context-only commit", async () => {
    const root = await makeRepository();
    await mkdir(path.join(root, ".ccr"), { recursive: true });
    await writeFile(path.join(root, ".ccr/project.md"), "# Project\n", "utf8");
    await runCommand("git", ["add", "."], { cwd: root });
    await runCommand("git", ["commit", "--quiet", "-m", "context only"], { cwd: root });

    const result = await runAfterCommitCheck(root);
    expect(result.shouldWarn).toBe(false);
    expect(result.prompt).toBeUndefined();
    const journalPath = result.journalPath;
    if (journalPath === undefined) throw new Error("Expected a journal path.");
    const content = await readFile(path.join(root, journalPath), "utf8");
    expect(content).toContain(`**Commit**: \`${result.commit}\``);
    expect(content).not.toContain("## Changed paths");
  });

  it("should keep the context warning when journal creation fails", async () => {
    const root = await makeRepository();
    await commitPath(root, "main.py", "print('x')\n");
    await mkdir(path.join(root, ".ccr"), { recursive: true });
    await writeFile(path.join(root, ".ccr/journal"), "", "utf8");

    const result = await runAfterCommitCheck(root);
    expect(result.journalCreated).toBe(false);
    expect(result.journalPath).toBeUndefined();
    expect(result.shouldWarn).toBe(true);
    expect(result.prompt).toBeTruthy();
  });

  it("should not prompt for a commit containing only local context state", async () => {
    const root = await makeRepository();
    await mkdir(path.join(root, ".ccr"), { recursive: true });
    await writeFile(path.join(root, ".ccr/config.local.json"), "{}\n", "utf8");
    await runCommand("git", ["add", "--force", "--", ".ccr/config.local.json"], { cwd: root });
    await runCommand("git", ["commit", "--quiet", "-m", "local context only"], { cwd: root });

    const result = await runAfterCommitCheck(root);

    expect(result.shouldWarn).toBe(false);
    expect(result.prompt).toBeUndefined();
  });
});
