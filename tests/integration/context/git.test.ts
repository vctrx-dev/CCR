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
  readStagedContextState,
} from "../../../src/context/git";
import {
  createTemporaryGitRepository,
  createTemporaryRootRegistry,
  runCommand,
} from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();

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
