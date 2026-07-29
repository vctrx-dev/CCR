import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { isGitIgnored, readStagedContextState } from "../../../src/context/git";

const run = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function makeRepository(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-git-"));
  roots.push(root);
  await run("git", ["init", "--quiet"], { cwd: root });
  return root;
}

describe("readStagedContextState", () => {
  it("should warn when repository files are staged without shared context", async () => {
    const root = await makeRepository();
    await writeFile(path.join(root, "main.py"), "print('hello')\n", "utf8");
    await run("git", ["add", "main.py"], { cwd: root });

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
    await run("git", ["add", "."], { cwd: root });

    expect((await readStagedContextState(root)).shouldWarn).toBe(false);
  });

  it("should identify a locally ignored Claude skill", async () => {
    const root = await makeRepository();
    await writeFile(path.join(root, ".gitignore"), ".claude/\n", "utf8");
    expect(isGitIgnored(root, ".claude/skills/ccr/SKILL.md")).toBe(true);
  });
});
