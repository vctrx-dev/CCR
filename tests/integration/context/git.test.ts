import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyContextChanges,
  isGitIgnored,
  isSharedContext,
  readBoundedStagedDiff,
  readBoundedUnstagedDiff,
  readChangedPaths,
  readFilteredWorktreePathFingerprints,
  readLiveGitInventory,
  readStagedContextState,
  readWorkingTreeFingerprints,
} from "../../../src/context/git";
import {
  createTemporaryGitRepository,
  createTemporaryRootRegistry,
  runCommand,
} from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();

it("should batch exact worktree paths while retaining filters and missing-file results", async () => {
  const root = await createTemporaryGitRepository(roots, "ccr-batched-hashes-");
  await writeFile(path.join(root, ".gitattributes"), "*.ts text eol=lf\n");
  const paths = Array.from({ length: 140 }, (_, index) => `rôle ${index}.ts`);
  await Promise.all(paths.map((file) => writeFile(path.join(root, file), "hello\r\n")));
  const filtered = readFilteredWorktreePathFingerprints(root, [
    ...paths,
    "missing.ts",
    paths[0] ?? "",
  ]);
  const expected = (
    await runCommand("git", ["hash-object", "--path=rôle 0.ts", "--", "rôle 0.ts"], { cwd: root })
  ).stdout.trim();
  expect(filtered.size).toBe(paths.length + 1);
  expect(paths.every((file) => filtered.get(file) === expected)).toBe(true);
  expect(filtered.get("missing.ts")).toBe("missing");
  const raw = readWorkingTreeFingerprints(root);
  expect(raw.get("rôle 0.ts")).not.toBe(expected);
});

it("should preserve exact Unicode paths and separate live states in an unborn repository", async () => {
  const root = await createTemporaryGitRepository(roots, "ccr-live-inventory-");
  const name = "- rôle with spaces.ts";
  await writeFile(path.join(root, name), "before\n");
  await runCommand("git", ["add", "--", name], { cwd: root });
  await writeFile(path.join(root, name), "after\n");
  await writeFile(path.join(root, "new.ts"), "new\n");
  const inventory = await readLiveGitInventory(root);
  expect(inventory.headEntries).toEqual([]);
  expect(inventory.entries.map((entry) => entry.path)).toEqual([name]);
  expect(inventory.stagedPaths).toEqual([name]);
  expect(inventory.unstagedPaths).toEqual([name]);
  expect(inventory.untrackedPaths).toEqual(["new.ts"]);
});

it("should report a bounded metadata failure without exposing process diagnostics", async () => {
  const root = await createTemporaryGitRepository(roots, "ccr-metadata-failure-");
  await expect(readLiveGitInventory(path.join(root, "private-missing-folder"))).rejects.toThrow(
    /^Git metadata read failed or exceeded its safe limit\.$/u,
  );
});

async function makeRepository(): Promise<string> {
  return createTemporaryGitRepository(roots, "ccr-git-");
}

describe("readStagedContextState", () => {
  it("should warn when repository files are staged without shared context", async () => {
    const root = await makeRepository();
    await writeFile(path.join(root, "main.py"), "print('hello')\n", "utf8");
    await runCommand("git", ["add", "main.py"], { cwd: root });

    expect(await readStagedContextState(root)).toEqual({
      stagedPaths: ["main.py"],
      hasRepositoryChanges: true,
      hasContextChanges: false,
      shouldWarn: true,
    });
  });

  it("should not warn when shared context is staged too", async () => {
    const { mkdir } = await import("node:fs/promises");
    const root = await makeRepository();
    await mkdir(path.join(root, ".ccr"));
    await writeFile(path.join(root, "main.py"), "print('hello')\n", "utf8");
    await writeFile(path.join(root, ".ccr/project.md"), "# Project\n", "utf8");
    await runCommand("git", ["add", "."], { cwd: root });

    expect((await readStagedContextState(root)).shouldWarn).toBe(false);
  });

  it("should identify a locally ignored Claude skill", async () => {
    const root = await makeRepository();
    await writeFile(path.join(root, ".gitignore"), ".claude/\n", "utf8");
    expect(isGitIgnored(root, ".claude/skills/ccr/SKILL.md")).toBe(true);
  });
});

describe("readChangedPaths", () => {
  it("should list the latest commit's changed paths", async () => {
    const root = await makeRepository();
    await runCommand("git", ["config", "user.name", "CCR Test"], { cwd: root });
    await runCommand("git", ["config", "user.email", "ccr@example.test"], { cwd: root });
    await writeFile(path.join(root, "a.txt"), "a\n", "utf8");
    await writeFile(path.join(root, "b.txt"), "b\n", "utf8");
    await runCommand("git", ["add", "."], { cwd: root });
    await runCommand("git", ["commit", "--quiet", "-m", "first"], { cwd: root });
    expect(readChangedPaths(root, 1)).toEqual(["a.txt", "b.txt"]);
  });

  it("should list paths across the requested number of commits", async () => {
    const root = await makeRepository();
    await runCommand("git", ["config", "user.name", "CCR Test"], { cwd: root });
    await runCommand("git", ["config", "user.email", "ccr@example.test"], { cwd: root });
    await writeFile(path.join(root, "a.txt"), "a\n", "utf8");
    await runCommand("git", ["add", "."], { cwd: root });
    await runCommand("git", ["commit", "--quiet", "-m", "first"], { cwd: root });
    await writeFile(path.join(root, "b.txt"), "b\n", "utf8");
    await runCommand("git", ["add", "."], { cwd: root });
    await runCommand("git", ["commit", "--quiet", "-m", "second"], { cwd: root });
    expect(readChangedPaths(root, 5).sort()).toEqual(["a.txt", "b.txt"]);
  });

  it("should return an empty array for a repository without commits", async () => {
    const root = await makeRepository();
    expect(readChangedPaths(root, 1)).toEqual([]);
  });
});

describe("bounded Git diffs", () => {
  it("should classify Git-native staged and unstaged binary diff markers", async () => {
    const root = await makeRepository();
    await runCommand("git", ["config", "user.name", "CCR Test"], { cwd: root });
    await runCommand("git", ["config", "user.email", "ccr@example.test"], { cwd: root });
    const target = path.join(root, "binary.dat");
    await writeFile(target, Buffer.from([0, 1, 2, 3]));
    await runCommand("git", ["add", "binary.dat"], { cwd: root });
    await runCommand("git", ["commit", "--quiet", "-m", "seed"], { cwd: root });
    await writeFile(target, Buffer.from([0, 4, 5, 6]));
    await runCommand("git", ["add", "binary.dat"], { cwd: root });
    await writeFile(target, Buffer.from([0, 7, 8, 9]));

    await expect(readBoundedStagedDiff(root, "binary.dat", 20_000)).resolves.toEqual({
      content: "",
      isBinary: true,
      isTruncated: false,
    });
    await expect(readBoundedUnstagedDiff(root, "binary.dat", 20_000)).resolves.toEqual({
      content: "",
      isBinary: true,
      isTruncated: false,
    });
  });
});

describe("classifyContextChanges", () => {
  it("should separate repository changes from shared context changes", () => {
    expect(classifyContextChanges(["main.py", ".ccr/project.md"])).toEqual({
      repositoryChanges: ["main.py"],
      hasRepositoryChanges: true,
      hasContextChanges: true,
      shouldWarn: false,
    });
  });

  it("should warn when only repository files changed", () => {
    expect(classifyContextChanges(["main.py"])).toEqual({
      repositoryChanges: ["main.py"],
      hasRepositoryChanges: true,
      hasContextChanges: false,
      shouldWarn: true,
    });
  });

  it("should not warn for a context-only change", () => {
    expect(classifyContextChanges([".ccr/project.md"])).toEqual({
      repositoryChanges: [],
      hasRepositoryChanges: false,
      hasContextChanges: true,
      shouldWarn: false,
    });
  });
});

describe("isSharedContext", () => {
  it("should classify shared .ccr files and exclude local state", () => {
    expect(isSharedContext(".ccr/project.md")).toBe(true);
    expect(isSharedContext(".ccr/index.md")).toBe(false);
    expect(isSharedContext(".ccr/stakeholders.md")).toBe(true);
    expect(isSharedContext(".ccr/journal/feature_x/2026-01-01T00-00-00Z.md")).toBe(false);
    expect(isSharedContext(".ccr/config.local.json")).toBe(false);
    expect(isSharedContext("src/main.ts")).toBe(false);
  });
});
