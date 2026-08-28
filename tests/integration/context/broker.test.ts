import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import {
  listSafeCommitPaths,
  listSafeRecentPaths,
  listSafeRepositoryPaths,
  readSafeCommitFile,
  readSafeRepositoryDiff,
  readSafeRepositoryFile,
  readSharedContextFile,
} from "../../../src/context/broker";
import { DEFAULT_CONTEXT_CONFIG, serializeContextConfig } from "../../../src/context/config";
import {
  createTemporaryGitRepository,
  createTemporaryRootRegistry,
  runCommand,
} from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();

it("should list privacy-filtered paths from recent commits", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-recent-"));
  roots.push(root);
  await runCommand("git", ["init", "--quiet"], { cwd: root });
  await runCommand("git", ["config", "user.email", "test@example.com"], { cwd: root });
  await runCommand("git", ["config", "user.name", "CCR Test"], { cwd: root });
  await mkdir(path.join(root, ".ccr"));
  await mkdir(path.join(root, "src"));
  await mkdir(path.join(root, "src2"));
  await writeFile(
    path.join(root, ".ccr/config.json"),
    serializeContextConfig(DEFAULT_CONTEXT_CONFIG),
    "utf8",
  );
  await writeFile(path.join(root, "src/main.ts"), "export {};\n", "utf8");
  await writeFile(path.join(root, ".env.production"), "SECRET=x\n", "utf8");
  await runCommand("git", ["add", "--force", "--", "."], { cwd: root });
  await runCommand("git", ["commit", "--quiet", "-m", "test: seed"], { cwd: root });

  expect(await listSafeRecentPaths(root)).toEqual({
    paths: [".ccr/config.json", "src/main.ts"],
    excludedCount: 1,
  });
});

it("should expose only approved index content and never unstaged or symlink content", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-broker-"));
  roots.push(root);
  await runCommand("git", ["init", "--quiet"], { cwd: root });
  await mkdir(path.join(root, ".ccr"));
  await mkdir(path.join(root, "src"));
  await mkdir(path.join(root, "src2"));
  await writeFile(
    path.join(root, ".ccr/config.json"),
    serializeContextConfig(DEFAULT_CONTEXT_CONFIG),
    "utf8",
  );
  await writeFile(path.join(root, "src/main.ts"), "export const value = 'staged-safe';\n", "utf8");
  await writeFile(path.join(root, "src2/other.ts"), "export const other = true;\n", "utf8");
  await writeFile(path.join(root, ".NPMRC"), "token=private\n", "utf8");
  await writeFile(path.join(root, "link-target.txt"), "private-target\n", "utf8");
  await runCommand("git", ["add", "--", ".ccr/config.json", "src/main.ts", "src2/other.ts"], {
    cwd: root,
  });
  await runCommand("git", ["add", "--force", "--", ".NPMRC"], { cwd: root });
  const { stdout } = await runCommand("git", ["hash-object", "-w", "link-target.txt"], {
    cwd: root,
  });
  await runCommand(
    "git",
    ["update-index", "--add", "--cacheinfo", `120000,${stdout.trim()},src/linked.txt`],
    { cwd: root },
  );
  await writeFile(path.join(root, "src/main.ts"), "UNSTAGED_PRIVATE_VALUE\n", "utf8");

  const listed = await listSafeRepositoryPaths(root, "src/");
  expect(listed.paths).toEqual(["src/main.ts"]);
  expect((await listSafeRepositoryPaths(root, "src")).paths).toEqual(["src/main.ts"]);
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

it("should expose only privacy-approved regular files changed by the exact HEAD commit", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-broker-commit-"));
  roots.push(root);
  await runCommand("git", ["init", "--quiet"], { cwd: root });
  await runCommand("git", ["config", "user.email", "test@example.com"], { cwd: root });
  await runCommand("git", ["config", "user.name", "CCR Test"], { cwd: root });
  await mkdir(path.join(root, ".ccr"));
  await writeFile(
    path.join(root, ".ccr/config.json"),
    serializeContextConfig(DEFAULT_CONTEXT_CONFIG),
    "utf8",
  );
  await writeFile(path.join(root, "unchanged.ts"), "export const unchanged = true;\n", "utf8");
  await writeFile(path.join(root, "deleted.ts"), "export const deleted = true;\n", "utf8");
  await writeFile(path.join(root, "renamed-old.ts"), "export const renamed = true;\n", "utf8");
  await runCommand(
    "git",
    ["add", ".ccr/config.json", "unchanged.ts", "deleted.ts", "renamed-old.ts"],
    { cwd: root },
  );
  await runCommand("git", ["commit", "--quiet", "-m", "seed"], { cwd: root });
  await rm(path.join(root, "deleted.ts"));
  await runCommand("git", ["mv", "renamed-old.ts", "renamed-new.ts"], { cwd: root });
  await writeFile(path.join(root, "changed.ts"), "export const changed = true;\n", "utf8");
  await writeFile(path.join(root, ".env.commit"), "SECRET=hidden\n", "utf8");
  await writeFile(path.join(root, "binary.dat"), Buffer.from([0, 1, 2, 255]));
  await runCommand("git", ["add", "changed.ts", "binary.dat", "deleted.ts"], { cwd: root });
  await runCommand("git", ["add", "--force", ".env.commit"], { cwd: root });
  await runCommand("git", ["commit", "--quiet", "-m", "change"], { cwd: root });
  const { stdout } = await runCommand("git", ["rev-parse", "HEAD"], { cwd: root });
  const commit = stdout.trim();

  expect(await listSafeCommitPaths(root, commit)).toEqual({
    paths: ["binary.dat", "changed.ts", "deleted.ts", "renamed-new.ts", "renamed-old.ts"],
    excludedCount: 1,
    omittedCount: 0,
  });
  await expect(readSafeCommitFile(root, commit, "changed.ts")).resolves.toContain("changed = true");
  await expect(readSafeCommitFile(root, commit, "binary.dat")).resolves.toBe(
    "[CCR binary repository evidence omitted]\n",
  );
  await expect(readSafeCommitFile(root, commit, "deleted.ts")).resolves.toBe(
    "[CCR file deleted in current commit]\n",
  );
  await expect(readSafeCommitFile(root, commit, "renamed-old.ts")).resolves.toBe(
    "[CCR file deleted in current commit]\n",
  );
  await expect(readSafeCommitFile(root, commit, "renamed-new.ts")).resolves.toContain(
    "renamed = true",
  );
  await expect(readSafeCommitFile(root, commit, ".env.commit")).rejects.toThrow(/approved/i);
  await expect(readSafeCommitFile(root, commit, "unchanged.ts")).rejects.toThrow(/approved/i);

  await writeFile(path.join(root, "later.ts"), "export {};\n", "utf8");
  await runCommand("git", ["add", "later.ts"], { cwd: root });
  await runCommand("git", ["commit", "--quiet", "-m", "later"], { cwd: root });
  await expect(listSafeCommitPaths(root, commit)).rejects.toThrow(/current HEAD/i);
  await expect(listSafeCommitPaths(root, "not-a-commit")).rejects.toThrow();
}, 30_000);

it("should exclude a gitlink changed by the exact HEAD commit without reading its object", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-broker-commit-gitlink-"));
  roots.push(root);
  await runCommand("git", ["init", "--quiet"], { cwd: root });
  await runCommand("git", ["config", "user.email", "test@example.com"], { cwd: root });
  await runCommand("git", ["config", "user.name", "CCR Test"], { cwd: root });
  await mkdir(path.join(root, ".ccr"));
  await writeFile(
    path.join(root, ".ccr/config.json"),
    serializeContextConfig(DEFAULT_CONTEXT_CONFIG),
    "utf8",
  );
  await writeFile(path.join(root, "seed.txt"), "seed\n", "utf8");
  await runCommand("git", ["add", ".ccr/config.json", "seed.txt"], { cwd: root });
  await runCommand("git", ["commit", "--quiet", "-m", "seed"], { cwd: root });
  const linkedCommit = (
    await runCommand("git", ["rev-parse", "HEAD"], { cwd: root })
  ).stdout.trim();
  await runCommand(
    "git",
    ["update-index", "--add", "--cacheinfo", `160000,${linkedCommit},vendor/module`],
    { cwd: root },
  );
  await runCommand("git", ["commit", "--quiet", "-m", "add gitlink"], { cwd: root });
  const commit = (await runCommand("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();

  expect(await listSafeCommitPaths(root, commit)).toEqual({
    paths: [],
    excludedCount: 1,
    omittedCount: 0,
  });
  await expect(readSafeCommitFile(root, commit, "vendor/module")).rejects.toThrow(/approved/i);
});

it("should paginate a large safe file inventory without gaps or duplicates", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-broker-pages-"));
  roots.push(root);
  await runCommand("git", ["init", "--quiet"], { cwd: root });
  await mkdir(path.join(root, ".ccr"));
  await mkdir(path.join(root, "source"));
  await writeFile(
    path.join(root, ".ccr/config.json"),
    serializeContextConfig(DEFAULT_CONTEXT_CONFIG),
    "utf8",
  );
  const expected = Array.from(
    { length: 120 },
    (_, index) => `source/${index.toString().padStart(3, "0")}-${"long-name-".repeat(6)}.ts`,
  );
  await Promise.all(
    expected.map((relativePath) =>
      writeFile(path.join(root, relativePath), "export {};\n", "utf8"),
    ),
  );
  await runCommand("git", ["add", "--", ".ccr/config.json", "source"], { cwd: root });

  const first = await listSafeRepositoryPaths(root, "source");
  expect(first.omittedCount).toBeGreaterThan(0);
  expect(first.nextCursor).toBe(first.paths.at(-1));
  const second = await listSafeRepositoryPaths(root, "source", first.nextCursor);

  expect(new Set([...first.paths, ...second.paths])).toEqual(new Set(expected));
  expect(first.paths.filter((candidate) => second.paths.includes(candidate))).toEqual([]);
  expect(second.omittedCount).toBe(0);
  expect(second.nextCursor).toBeUndefined();
});

it("should bound an oversized shared context document before returning it", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-broker-shared-context-"));
  roots.push(root);
  await mkdir(path.join(root, ".ccr"));
  await writeFile(
    path.join(root, ".ccr/project.md"),
    `${"p".repeat(10_000)}SHOULD_NOT_BE_EXPOSED`,
    "utf8",
  );

  await expect(readSharedContextFile(root, ".ccr/project.md")).resolves.toBe(
    `${"p".repeat(10_000)}\n[CCR truncated at 10000 characters]\n`,
  );
});

it("should expose the current decisions document through the shared-context boundary", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-broker-decisions-"));
  roots.push(root);
  await mkdir(path.join(root, ".ccr"));
  await writeFile(path.join(root, ".ccr/decisions.md"), "- Keep reviews advisory.\n", "utf8");

  await expect(readSharedContextFile(root, ".ccr/decisions.md")).resolves.toBe(
    "- Keep reviews advisory.\n",
  );
});

it("should reject malformed UTF-8 and NUL bytes in shared context", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-broker-shared-context-utf8-"));
  roots.push(root);
  await mkdir(path.join(root, ".ccr"));
  const target = path.join(root, ".ccr/project.md");

  await writeFile(target, Buffer.from("# Project\n\0", "utf8"));
  await expect(readSharedContextFile(root, ".ccr/project.md")).rejects.toThrow("valid UTF-8 text");

  await writeFile(target, Buffer.concat([Buffer.from("# Project\n", "utf8"), Buffer.from([255])]));
  await expect(readSharedContextFile(root, ".ccr/project.md")).rejects.toThrow("valid UTF-8 text");
});

it("should bound index blobs and staged diffs before Git can overflow its output buffer", async () => {
  const root = await createTemporaryGitRepository(roots, "ccr-broker-bounded-git-");
  await mkdir(path.join(root, ".ccr"));
  await writeFile(
    path.join(root, ".ccr/config.json"),
    serializeContextConfig(DEFAULT_CONTEXT_CONFIG),
    "utf8",
  );
  const target = path.join(root, "large.txt");
  await writeFile(target, `${"x".repeat(17 * 1024 * 1024)}UNEXPOSED`, "utf8");
  await runCommand("git", ["add", ".ccr/config.json", "large.txt"], { cwd: root });

  const indexed = await readSafeRepositoryFile(root, "large.txt");
  const diff = await readSafeRepositoryDiff(root, "large.txt");

  expect(indexed).toBe(`${"x".repeat(10_000)}\n[CCR truncated at 10000 characters]\n`);
  expect(indexed).not.toContain("UNEXPOSED");
  expect(diff.length).toBeLessThan(11_000);
  expect(diff).toContain("[CCR truncated at 10000 characters]");

  await runCommand("git", ["commit", "--quiet", "-m", "large"], { cwd: root });
  const { stdout } = await runCommand("git", ["rev-parse", "HEAD"], { cwd: root });
  await expect(readSafeCommitFile(root, stdout.trim(), "large.txt")).resolves.toBe(indexed);
}, 30_000);

it("should omit an approved binary index blob with an explicit marker", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-broker-binary-"));
  roots.push(root);
  await runCommand("git", ["init", "--quiet"], { cwd: root });
  await mkdir(path.join(root, ".ccr"));
  await writeFile(
    path.join(root, ".ccr/config.json"),
    serializeContextConfig(DEFAULT_CONTEXT_CONFIG),
    "utf8",
  );
  await writeFile(path.join(root, "binary.dat"), Buffer.from([0, 1, 2, 255]));
  await runCommand("git", ["add", ".ccr/config.json", "binary.dat"], { cwd: root });

  await expect(readSafeRepositoryFile(root, "binary.dat")).resolves.toBe(
    "[CCR binary repository evidence omitted]\n",
  );
  await expect(readSafeRepositoryDiff(root, "binary.dat")).resolves.toBe(
    "[CCR binary staged diff omitted]\n",
  );
});
