import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  contextAssessmentPath,
  hasCurrentContextAssessment,
  isMatchingContextAssessment,
  recordContextAssessment,
} from "../../../src/context/assessment";
import { applySetup } from "../../../src/context/setup";
import { computeWorkingReviewState } from "../../../src/review/review-fingerprint";
import {
  createTemporaryGitRepository,
  createTemporaryRootRegistry,
  runCommand,
} from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();

const CODE = `sha256:${"a".repeat(64)}`;
const CONTEXT = `sha256:${"b".repeat(64)}`;

describe("context assessment", () => {
  it("matches assessed work after staging and committing but not subsequent edits", async () => {
    const root = await createTemporaryGitRepository(roots, "ccr-assessment-commit-");
    await applySetup(root);
    await writeFile(path.join(root, "feature.txt"), "initial\n");
    await runCommand("git", ["add", "."], { cwd: root });
    await runCommand("git", ["commit", "--quiet", "-m", "test: seed"], { cwd: root });
    await writeFile(path.join(root, "feature.txt"), "assessed\n");
    const state = await computeWorkingReviewState(root);
    await recordContextAssessment(root, {
      codeFingerprint: state.fingerprint,
      contextFingerprint: state.contextFingerprint,
      summary: "Existing product explanation still applies.",
    });
    await runCommand("git", ["add", "feature.txt"], { cwd: root });
    expect(await hasCurrentContextAssessment(root)).toBe(true);
    await runCommand("git", ["commit", "--quiet", "-m", "test: assessed change"], { cwd: root });
    const commit = await runCommand("git", ["rev-parse", "HEAD"], { cwd: root });
    expect(await hasCurrentContextAssessment(root, commit.stdout.trim())).toBe(true);
    await writeFile(path.join(root, "feature.txt"), "unassessed\n");
    await runCommand("git", ["add", "feature.txt"], { cwd: root });
    expect(await hasCurrentContextAssessment(root)).toBe(false);
  });
  it("persists an explicit assessment and invalidates it when context changes", async () => {
    const root = await createTemporaryGitRepository(roots, "ccr-assessment-");
    await applySetup(root);
    await runCommand("git", ["add", "."], { cwd: root });
    await runCommand("git", ["commit", "--quiet", "-m", "test: seed"], { cwd: root });
    expect(await hasCurrentContextAssessment(root)).toBe(false);
    const state = await computeWorkingReviewState(root);
    const assessment = {
      codeFingerprint: state.fingerprint,
      contextFingerprint: state.contextFingerprint,
      summary: "Product context checked; no change needed.",
    };
    await recordContextAssessment(root, assessment);
    expect(await hasCurrentContextAssessment(root)).toBe(true);
    await writeFile(path.join(root, ".ccr/project.md"), "# Project\nChanged product purpose.\n");
    expect(await hasCurrentContextAssessment(root)).toBe(false);
    await expect(recordContextAssessment(root, assessment)).rejects.toThrow("evidence changed");
  });
  it("keeps each branch's receipt when another branch records an assessment", async () => {
    const root = await createTemporaryGitRepository(roots, "ccr-assessment-branches-", "main");
    await applySetup(root);
    await writeFile(path.join(root, "feature.txt"), "initial\n");
    await runCommand("git", ["add", "."], { cwd: root });
    await runCommand("git", ["commit", "--quiet", "-m", "test: seed"], { cwd: root });
    const assessStagedWork = async (content: string) => {
      await writeFile(path.join(root, "feature.txt"), content);
      await runCommand("git", ["add", "feature.txt"], { cwd: root });
      const state = await computeWorkingReviewState(root);
      await recordContextAssessment(root, {
        codeFingerprint: state.fingerprint,
        contextFingerprint: state.contextFingerprint,
        summary: "No lasting product change.",
      });
    };
    await assessStagedWork("main work\n");
    await runCommand("git", ["stash", "--quiet"], { cwd: root });
    await runCommand("git", ["switch", "--quiet", "-c", "other"], { cwd: root });
    await assessStagedWork("other work\n");
    await runCommand("git", ["stash", "--quiet"], { cwd: root });
    await runCommand("git", ["switch", "--quiet", "main"], { cwd: root });
    await runCommand("git", ["stash", "pop", "--quiet", "stash@{1}"], { cwd: root });
    await runCommand("git", ["add", "feature.txt"], { cwd: root });

    expect(await hasCurrentContextAssessment(root)).toBe(true);
  });
  it("keeps reminders active when persisted receipts are malformed or oversized", async () => {
    const root = await createTemporaryGitRepository(roots, "ccr-assessment-invalid-");
    await applySetup(root);
    const { writeManagedText } = await import("../../../src/context/files");
    for (const text of ["{", "{}", "x".repeat(2_001)]) {
      await writeManagedText(root, contextAssessmentPath(root), text);
      expect(await hasCurrentContextAssessment(root)).toBe(false);
    }
  });
  it("recognizes a recorded unchanged-context decision only for its exact evidence", () => {
    const record = {
      codeFingerprint: CODE,
      contextFingerprint: CONTEXT,
      summary: "Internal rename; product behavior is unchanged.",
    };
    expect(isMatchingContextAssessment(record, CODE, CONTEXT)).toBe(true);
    expect(isMatchingContextAssessment(record, CONTEXT, CONTEXT)).toBe(false);
    expect(isMatchingContextAssessment(record, CODE, CODE)).toBe(false);
  });
  it("does not mistake missing, malformed, or oversized data for an assessment", () => {
    for (const value of [
      undefined,
      {},
      { codeFingerprint: CODE, contextFingerprint: CONTEXT, summary: "x".repeat(501) },
    ]) {
      expect(isMatchingContextAssessment(value, CODE, CONTEXT)).toBe(false);
    }
  });
});
