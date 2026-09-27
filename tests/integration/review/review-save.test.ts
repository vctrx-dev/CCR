import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTEXT_CONFIG, serializeContextConfig } from "../../../src/context/config";
import { saveReview } from "../../../src/review/review-save";
import { readStagedReviewFreshness } from "../../../src/review/review-state";
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
