import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";
import { installContextHook, removeContextHook } from "../../../src/context/hooks";

const run = promisify(execFile);
const roots: string[] = [];

async function createRepository(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-hooks-"));
  roots.push(root);
  await run("git", ["init", "--quiet"], { cwd: root });
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

it("should compose with a Husky pre-commit hook and remove only its own block", async () => {
  const root = await createRepository();
  await run("git", ["config", "core.hooksPath", ".husky/_"], { cwd: root });
  const hookPath = path.join(root, ".husky/pre-commit");
  await mkdir(path.dirname(hookPath), { recursive: true });
  await writeFile(hookPath, "pnpm test\n", "utf8");

  expect((await installContextHook(root)).status).toBe("installed");
  expect((await installContextHook(root)).status).toBe("already-installed");
  expect(await readFile(hookPath, "utf8")).toContain("pnpm test");
  expect(await readFile(hookPath, "utf8")).toContain("# ccr:start");

  expect((await removeContextHook(root)).status).toBe("removed");
  expect(await readFile(hookPath, "utf8")).toBe("pnpm test\n");
});

it("should refuse a configured hooks path outside the repository", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "ccr-hooks-boundary-"));
  roots.push(parent);
  const root = path.join(parent, "repository");
  await mkdir(root);
  await run("git", ["init", "--quiet"], { cwd: root });
  await run("git", ["config", "core.hooksPath", "../external-hooks"], { cwd: root });

  await expect(installContextHook(root)).rejects.toThrow(/outside the repository/i);
  await expect(readFile(path.join(parent, "external-hooks/pre-commit"), "utf8")).rejects.toThrow();
});

it.each([
  ["Node", "#!/usr/bin/env node\nprocess.exit(0);\n"],
  ["Python", "#!/usr/bin/env python3\nprint('existing')\n"],
])("should refuse to compose with an existing %s hook", async (_name, existing) => {
  const root = await createRepository();
  const hookPath = path.join(root, ".git/hooks/pre-commit");
  await writeFile(hookPath, existing, "utf8");

  await expect(installContextHook(root)).rejects.toThrow(/POSIX shell or Husky/i);
  expect(await readFile(hookPath, "utf8")).toBe(existing);
});

it("should upgrade and remove a managed block using stable markers", async () => {
  const root = await createRepository();
  const hookPath = path.join(root, ".git/hooks/pre-commit");
  const original = "#!/bin/sh\npnpm test\n";
  await writeFile(
    hookPath,
    `${original}\n# ccr:start - advisory context check\nold ccr command\n# ccr:end\n`,
    "utf8",
  );

  expect((await installContextHook(root)).status).toBe("installed");
  const upgraded = await readFile(hookPath, "utf8");
  expect(upgraded).not.toContain("old ccr command");
  expect(upgraded).toContain("npx --no-install ccr hooks check");
  expect(upgraded.match(/# ccr:start - advisory context check/g)).toHaveLength(1);

  expect((await removeContextHook(root)).status).toBe("removed");
  expect(await readFile(hookPath, "utf8")).toBe(original);
});

it.each([
  "#!/bin/sh\n# ccr:start - advisory context check\nmissing end\n",
  [
    "#!/bin/sh",
    "# ccr:start - advisory context check",
    "first",
    "# ccr:end",
    "# ccr:start - advisory context check",
    "second",
    "# ccr:end",
    "",
  ].join("\n"),
])("should reject malformed or duplicate managed markers without mutation", async (existing) => {
  const root = await createRepository();
  const hookPath = path.join(root, ".git/hooks/pre-commit");
  await writeFile(hookPath, existing, "utf8");

  await expect(installContextHook(root)).rejects.toThrow(/managed markers/i);
  await expect(removeContextHook(root)).rejects.toThrow(/managed markers/i);
  expect(await readFile(hookPath, "utf8")).toBe(existing);
});
