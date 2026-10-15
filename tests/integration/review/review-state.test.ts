import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTEXT_CONFIG, serializeContextConfig } from "../../../src/context/config";
import {
  computeStagedReviewState,
  computeWorkingReviewState,
} from "../../../src/review/review-state";
import { createTemporaryRootRegistry, runCommand } from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();

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
});
