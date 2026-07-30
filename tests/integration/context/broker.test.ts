import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";
import {
  listSafeRecentPaths,
  listSafeRepositoryPaths,
  readSafeRepositoryDiff,
  readSafeRepositoryFile,
} from "../../../src/context/broker";
import { DEFAULT_CONTEXT_CONFIG } from "../../../src/context/config";

const run = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

it("should list privacy-filtered paths from recent commits", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-recent-"));
  roots.push(root);
  await run("git", ["init", "--quiet"], { cwd: root });
  await run("git", ["config", "user.email", "test@example.com"], { cwd: root });
  await run("git", ["config", "user.name", "CCR Test"], { cwd: root });
  await mkdir(path.join(root, ".ccr"));
  await mkdir(path.join(root, "src"));
  await writeFile(
    path.join(root, ".ccr/config.json"),
    `${JSON.stringify(DEFAULT_CONTEXT_CONFIG)}\n`,
    "utf8",
  );
  await writeFile(path.join(root, "src/main.ts"), "export {};\n", "utf8");
  await writeFile(path.join(root, ".env.production"), "SECRET=x\n", "utf8");
  await run("git", ["add", "--force", "--", "."], { cwd: root });
  await run("git", ["commit", "--quiet", "-m", "test: seed"], { cwd: root });

  expect(await listSafeRecentPaths(root)).toEqual({
    paths: [".ccr/config.json", "src/main.ts"],
    excludedCount: 1,
  });
});

it("should expose only approved index content and never unstaged or symlink content", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-broker-"));
  roots.push(root);
  await run("git", ["init", "--quiet"], { cwd: root });
  await mkdir(path.join(root, ".ccr"));
  await mkdir(path.join(root, "src"));
  await writeFile(
    path.join(root, ".ccr/config.json"),
    `${JSON.stringify(DEFAULT_CONTEXT_CONFIG)}\n`,
    "utf8",
  );
  await writeFile(path.join(root, "src/main.ts"), "export const value = 'staged-safe';\n", "utf8");
  await writeFile(path.join(root, ".NPMRC"), "token=private\n", "utf8");
  await writeFile(path.join(root, "link-target.txt"), "private-target\n", "utf8");
  await run("git", ["add", "--", ".ccr/config.json", "src/main.ts"], { cwd: root });
  await run("git", ["add", "--force", "--", ".NPMRC"], { cwd: root });
  const { stdout } = await run("git", ["hash-object", "-w", "link-target.txt"], { cwd: root });
  await run(
    "git",
    ["update-index", "--add", "--cacheinfo", `120000,${stdout.trim()},src/linked.txt`],
    { cwd: root },
  );
  await writeFile(path.join(root, "src/main.ts"), "UNSTAGED_PRIVATE_VALUE\n", "utf8");

  const listed = await listSafeRepositoryPaths(root, "src/");
  expect(listed.paths).toEqual(["src/main.ts"]);
  await expect(readSafeRepositoryFile(root, ".NPMRC")).rejects.toThrow("not an approved");
  await expect(readSafeRepositoryFile(root, "src/linked.txt")).rejects.toThrow("not an approved");

  const indexed = await readSafeRepositoryFile(root, "src/main.ts");
  const stagedDiff = await readSafeRepositoryDiff(root, "src/main.ts");
  expect(indexed).toContain("staged-safe");
  expect(indexed).not.toContain("UNSTAGED_PRIVATE_VALUE");
  expect(stagedDiff).toContain("staged-safe");
  expect(stagedDiff).not.toContain("UNSTAGED_PRIVATE_VALUE");
  expect(await readFile(path.join(root, "src/main.ts"), "utf8")).toContain(
    "UNSTAGED_PRIVATE_VALUE",
  );
});
