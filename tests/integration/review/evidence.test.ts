import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { DEFAULT_CONTEXT_CONFIG, serializeContextConfig } from "../../../src/context/config";
import { listSafeReviewChanges, readSafeReviewEvidence } from "../../../src/review/evidence";
import { createTemporaryRootRegistry, runCommand } from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();
const readFileMock = vi.hoisted(() => vi.fn());

function writeGitIndexInfo(root: string, content: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["update-index", "--index-info"], {
      cwd: root,
      stdio: ["pipe", "ignore", "pipe"],
      windowsHide: true,
    });
    let errorOutput = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      errorOutput += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`git update-index failed: ${errorOutput}`));
    });
    child.stdin.end(content);
  });
}

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  readFileMock.mockImplementation(actual.readFile);
  return { ...actual, readFile: readFileMock };
});

it("should expose staged, unstaged, and untracked review evidence through privacy filters", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-review-evidence-"));
  roots.push(root);
  await runCommand("git", ["init", "--quiet"], { cwd: root });
  await runCommand("git", ["config", "user.email", "test@example.com"], { cwd: root });
  await runCommand("git", ["config", "user.name", "CCR Test"], { cwd: root });
  await mkdir(path.join(root, ".ccr"));
  await mkdir(path.join(root, "src"));
  await writeFile(
    path.join(root, ".ccr/config.json"),
    serializeContextConfig(DEFAULT_CONTEXT_CONFIG),
    "utf8",
  );
  await writeFile(path.join(root, "src/staged.ts"), "export const staged = 1;\n", "utf8");
  await writeFile(path.join(root, "src/unstaged.ts"), "export const unstaged = 1;\n", "utf8");
  await runCommand("git", ["add", "--", ".ccr/config.json", "src/staged.ts", "src/unstaged.ts"], {
    cwd: root,
  });
  await runCommand("git", ["commit", "--quiet", "-m", "test: seed"], { cwd: root });

  await writeFile(path.join(root, "src/staged.ts"), "export const staged = 2;\n", "utf8");
  await runCommand("git", ["add", "--", "src/staged.ts"], { cwd: root });
  await writeFile(path.join(root, "src/staged.ts"), "export const staged = 3;\n", "utf8");
  await writeFile(path.join(root, "src/unstaged.ts"), "export const unstaged = 2;\n", "utf8");
  await writeFile(path.join(root, "src/untracked.ts"), "export const untracked = true;\n", "utf8");
  await writeFile(path.join(root, ".env.review"), "SECRET=hidden\n", "utf8");

  expect(await listSafeReviewChanges(root)).toEqual({
    stagedPaths: ["src/staged.ts"],
    unstagedPaths: ["src/staged.ts", "src/unstaged.ts"],
    untrackedPaths: ["src/untracked.ts"],
    excludedPathCount: 1,
  });

  const stagedEvidence = await readSafeReviewEvidence(root, "src/staged.ts");
  expect(stagedEvidence).toContain("## Staged diff");
  expect(stagedEvidence).toContain("staged = 2");
  expect(stagedEvidence).toContain("## Unstaged diff");
  expect(stagedEvidence).toContain("staged = 3");

  const untrackedEvidence = await readSafeReviewEvidence(root, "src/untracked.ts");
  expect(untrackedEvidence).toContain("## Untracked file");
  expect(untrackedEvidence).toContain("untracked = true");
  await expect(readSafeReviewEvidence(root, ".env.review")).rejects.toThrow(/approved review/i);
}, 30_000);

it("should use a bounded file read for approved untracked evidence", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-review-bounded-evidence-"));
  roots.push(root);
  await runCommand("git", ["init", "--quiet"], { cwd: root });
  await mkdir(path.join(root, ".ccr"));
  await writeFile(
    path.join(root, ".ccr/config.json"),
    serializeContextConfig(DEFAULT_CONTEXT_CONFIG),
    "utf8",
  );
  const target = path.join(root, "large-untracked.ts");
  await writeFile(target, "export const bounded = true;\n", "utf8");

  readFileMock.mockClear();
  try {
    await expect(readSafeReviewEvidence(root, "large-untracked.ts")).resolves.toContain(
      "export const bounded = true;",
    );
    expect(readFileMock).not.toHaveBeenCalledWith(target, "utf8");
  } finally {
    readFileMock.mockClear();
  }
});

it("should bound staged and unstaged diffs before Git can overflow its output buffer", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-review-bounded-diffs-"));
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
  const target = path.join(root, "large.ts");
  await writeFile(target, "export const value = 'base';\n", "utf8");
  await runCommand("git", ["add", ".ccr/config.json", "large.ts"], { cwd: root });
  await runCommand("git", ["commit", "--quiet", "-m", "seed"], { cwd: root });
  await writeFile(target, `A${"a".repeat(17 * 1024 * 1024)}\n`, "utf8");
  await runCommand("git", ["add", "large.ts"], { cwd: root });
  await writeFile(target, `B${"b".repeat(17 * 1024 * 1024)}\n`, "utf8");

  const evidence = await readSafeReviewEvidence(root, "large.ts");

  expect(evidence).toContain("## Staged diff");
  expect(evidence.length).toBeLessThan(21_000);
  expect(evidence).toContain("[CCR truncated review evidence at 20000 characters]");
}, 30_000);

it("should reject a live review overlay larger than the deterministic path limit", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-review-path-limit-"));
  roots.push(root);
  await runCommand("git", ["init", "--quiet"], { cwd: root });
  await mkdir(path.join(root, ".ccr"));
  await writeFile(
    path.join(root, ".ccr/config.json"),
    serializeContextConfig(DEFAULT_CONTEXT_CONFIG),
    "utf8",
  );
  await writeFile(path.join(root, "seed.txt"), "seed\n", "utf8");
  const { stdout } = await runCommand("git", ["hash-object", "-w", "seed.txt"], { cwd: root });
  const oid = stdout.trim();
  const indexInfo = Array.from(
    { length: 5_001 },
    (_, index) => `100644 ${oid}\tsrc/file-${index.toString().padStart(4, "0")}.ts\n`,
  ).join("");
  await writeGitIndexInfo(root, indexInfo);

  await expect(listSafeReviewChanges(root)).rejects.toThrow(/exceeds 5000 paths/i);
}, 30_000);

it("should omit approved binary untracked evidence with an explicit marker", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-review-binary-"));
  roots.push(root);
  await runCommand("git", ["init", "--quiet"], { cwd: root });
  await mkdir(path.join(root, ".ccr"));
  await writeFile(
    path.join(root, ".ccr/config.json"),
    serializeContextConfig(DEFAULT_CONTEXT_CONFIG),
    "utf8",
  );
  await writeFile(path.join(root, "binary.dat"), Buffer.from([0, 1, 2, 255]));

  await expect(readSafeReviewEvidence(root, "binary.dat")).resolves.toContain(
    "[CCR binary review evidence omitted]",
  );
});

it("should omit staged and unstaged binary diffs with explicit markers", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-review-binary-diffs-"));
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
  const binary = path.join(root, "binary.dat");
  await writeFile(binary, Buffer.from([0, 1, 2, 3]));
  await runCommand("git", ["add", ".ccr/config.json", "binary.dat"], { cwd: root });
  await runCommand("git", ["commit", "--quiet", "-m", "seed"], { cwd: root });
  await writeFile(binary, Buffer.from([0, 4, 5, 6]));
  await runCommand("git", ["add", "binary.dat"], { cwd: root });
  await writeFile(binary, Buffer.from([0, 7, 8, 9]));

  expect(await listSafeReviewChanges(root)).toEqual({
    stagedPaths: ["binary.dat"],
    unstagedPaths: ["binary.dat"],
    untrackedPaths: [],
    excludedPathCount: 0,
  });
  const evidence = await readSafeReviewEvidence(root, "binary.dat");
  expect(evidence).toContain("[CCR binary staged diff omitted]");
  expect(evidence).toContain("[CCR binary unstaged diff omitted]");
  expect(evidence).not.toContain("Binary files");
});

it("should exclude a staged symlink mode from all review evidence", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-review-staged-symlink-"));
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
  await writeFile(path.join(root, "unsafe.txt"), "regular\n", "utf8");
  await runCommand("git", ["add", ".ccr/config.json", "unsafe.txt"], { cwd: root });
  await runCommand("git", ["commit", "--quiet", "-m", "seed"], { cwd: root });
  const linkBlob = (
    await runCommand("git", ["hash-object", "-w", "unsafe.txt"], { cwd: root })
  ).stdout.trim();
  await runCommand("git", ["update-index", "--cacheinfo", `120000,${linkBlob},unsafe.txt`], {
    cwd: root,
  });

  expect(await listSafeReviewChanges(root)).toEqual({
    stagedPaths: [],
    unstagedPaths: [],
    untrackedPaths: [],
    excludedPathCount: 1,
  });
}, 30_000);
