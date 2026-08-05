import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { runAfterCommitCheck } from "../../../src/context/after-commit";

const run = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function makeRepository(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-after-commit-"));
  roots.push(root);
  await run("git", ["init", "--quiet", "-b", "main"], { cwd: root });
  await run("git", ["config", "user.name", "CCR Test"], { cwd: root });
  await run("git", ["config", "user.email", "ccr@example.test"], { cwd: root });
  return root;
}

async function commitPath(root: string, relativePath: string, content: string): Promise<void> {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
  await run("git", ["add", "--", relativePath], { cwd: root });
  await run("git", ["commit", "--quiet", "-m", `commit ${relativePath}`], { cwd: root });
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
    expect(result.prompt).toBeTruthy();

    const journalPath = result.journalPath;
    if (journalPath === undefined) throw new Error("Expected a journal path.");
    const content = await readFile(path.join(root, journalPath), "utf8");
    expect(content).toContain(`**Commit**: \`${result.commit}\``);
    expect(content).toContain("- main.py");

    const second = await runAfterCommitCheck(root);
    expect(second.journalCreated).toBe(false);
    expect(second.shouldWarn).toBe(true);
  });

  it("should not warn when the same commit also updated shared context", async () => {
    const root = await makeRepository();
    await mkdir(path.join(root, ".ccr"), { recursive: true });
    await writeFile(path.join(root, ".ccr/project.md"), "# Project\n", "utf8");
    await writeFile(path.join(root, "main.py"), "print('x')\n", "utf8");
    await run("git", ["add", "."], { cwd: root });
    await run("git", ["commit", "--quiet", "-m", "code and context"], { cwd: root });

    const result = await runAfterCommitCheck(root);
    expect(result.shouldWarn).toBe(false);
  });

  it("should return a no-op result when the repository has no HEAD commit", async () => {
    const root = await makeRepository();
    const result = await runAfterCommitCheck(root);
    expect(result.commit).toBe("");
    expect(result.journalCreated).toBe(false);
    expect(result.shouldWarn).toBe(false);
  });
});
