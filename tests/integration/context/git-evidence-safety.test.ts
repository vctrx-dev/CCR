import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import {
  listSafeCommitPaths,
  readSafeCommitDiff,
  readSafeRepositoryDiff,
} from "../../../src/context/broker";
import { readChangedPaths } from "../../../src/context/git";
import { readSafeReviewEvidence } from "../../../src/review/evidence";
import {
  createTemporaryGitRepository,
  createTemporaryRootRegistry,
  runCommand,
} from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();

it("should read literal staged, unstaged, and committed paths without excluded matches", async () => {
  const root = await createTemporaryGitRepository(roots, "ccr-literal-evidence-");
  await mkdir(path.join(root, ".ccr"));
  await writeFile(
    path.join(root, ".ccr/config.json"),
    JSON.stringify({ privacy: { excludedPaths: ["secret.txt"] } }),
  );
  await writeFile(path.join(root, "[s]ecret.txt"), "approved staged\n");
  await writeFile(path.join(root, "secret.txt"), "excluded staged\n");
  await runCommand("git", ["add", "."], { cwd: root });
  const staged = await readSafeRepositoryDiff(root, "[s]ecret.txt");
  expect(staged).toContain("approved staged");
  expect(staged).not.toContain("excluded staged");

  await writeFile(path.join(root, "[s]ecret.txt"), "approved unstaged\n");
  await writeFile(path.join(root, "secret.txt"), "excluded unstaged\n");
  const live = await readSafeReviewEvidence(root, "[s]ecret.txt");
  expect(live).toContain("approved staged");
  expect(live).toContain("approved unstaged");
  expect(live).not.toContain("excluded");

  await runCommand("git", ["commit", "-qm", "test: literal paths"], { cwd: root });
  const commit = (await runCommand("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  const committed = await readSafeCommitDiff(root, commit, "[s]ecret.txt");
  expect(committed).toContain("approved staged");
  expect(committed).not.toContain("excluded staged");
});

it("should expose merge changes and diffs against the first parent", async () => {
  const root = await createTemporaryGitRepository(roots, "ccr-merge-evidence-", "main");
  await mkdir(path.join(root, ".ccr"));
  await writeFile(path.join(root, ".ccr/config.json"), "{}");
  await runCommand("git", ["add", "."], { cwd: root });
  await runCommand("git", ["commit", "-qm", "test: base"], { cwd: root });
  await runCommand("git", ["switch", "-qc", "feature"], { cwd: root });
  await writeFile(path.join(root, "feature.txt"), "merged behavior\n");
  await runCommand("git", ["add", "."], { cwd: root });
  await runCommand("git", ["commit", "-qm", "test: feature"], { cwd: root });
  await runCommand("git", ["switch", "-q", "main"], { cwd: root });
  await runCommand("git", ["merge", "--no-ff", "-qm", "test: merge", "feature"], { cwd: root });
  const commit = (await runCommand("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();

  expect((await listSafeCommitPaths(root, commit)).paths).toEqual(["feature.txt"]);
  expect(readChangedPaths(root, 1)).toEqual(["feature.txt"]);
  await expect(readSafeCommitDiff(root, commit, "feature.txt")).resolves.toContain(
    "+merged behavior",
  );
});
