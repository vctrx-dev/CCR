import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, it, vi } from "vitest";
import { DEFAULT_CONTEXT_CONFIG, serializeContextConfig } from "../../../src/context/config";
import { listSafeReviewChanges, readSafeReviewEvidence } from "../../../src/review/evidence";

const run = promisify(execFile);
const roots: string[] = [];
const readFileMock = vi.hoisted(() => vi.fn());

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  readFileMock.mockImplementation(actual.readFile);
  return { ...actual, readFile: readFileMock };
});

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

it("should expose staged, unstaged, and untracked review evidence through privacy filters", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-review-evidence-"));
  roots.push(root);
  await run("git", ["init", "--quiet"], { cwd: root });
  await run("git", ["config", "user.email", "test@example.com"], { cwd: root });
  await run("git", ["config", "user.name", "CCR Test"], { cwd: root });
  await mkdir(path.join(root, ".ccr"));
  await mkdir(path.join(root, "src"));
  await writeFile(
    path.join(root, ".ccr/config.json"),
    serializeContextConfig(DEFAULT_CONTEXT_CONFIG),
    "utf8",
  );
  await writeFile(path.join(root, "src/staged.ts"), "export const staged = 1;\n", "utf8");
  await writeFile(path.join(root, "src/unstaged.ts"), "export const unstaged = 1;\n", "utf8");
  await run("git", ["add", "--", ".ccr/config.json", "src/staged.ts", "src/unstaged.ts"], {
    cwd: root,
  });
  await run("git", ["commit", "--quiet", "-m", "test: seed"], { cwd: root });

  await writeFile(path.join(root, "src/staged.ts"), "export const staged = 2;\n", "utf8");
  await run("git", ["add", "--", "src/staged.ts"], { cwd: root });
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
}, 10_000);

it("should use a bounded file read for approved untracked evidence", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-review-bounded-evidence-"));
  roots.push(root);
  await run("git", ["init", "--quiet"], { cwd: root });
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
