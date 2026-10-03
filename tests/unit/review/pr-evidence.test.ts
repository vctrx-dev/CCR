import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { DEFAULT_CONTEXT_CONFIG, serializeContextConfig } from "../../../src/context/config";
import {
  type PullRequestCommandRunner,
  readSafePullRequestEvidence,
  readSafePullRequestHeadEvidence,
} from "../../../src/review/pr-evidence";
import { createTemporaryRootRegistry } from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-pr-evidence-"));
  roots.push(root);
  await mkdir(path.join(root, ".ccr"));
  await writeFile(
    path.join(root, ".ccr/config.json"),
    serializeContextConfig(DEFAULT_CONTEXT_CONFIG),
    "utf8",
  );
  return root;
}

function metadata(filename: string): { filename: string; previousFilename: null; status: string } {
  return { filename, previousFilename: null, status: "modified" };
}

function createRunner(
  pages: Map<number, unknown[]>,
  patch = "diff --git a/src/file.ts b/src/file.ts\n",
): PullRequestCommandRunner {
  return vi.fn(async ({ arguments_ }) => {
    const joined = arguments_.join(" ");
    if (joined.startsWith("repo view")) return JSON.stringify({ nameWithOwner: "owner/repo" });
    if (joined.startsWith("pr view")) {
      return JSON.stringify({
        baseRefName: "main",
        baseRefOid: "a".repeat(40),
        headRefName: "feature",
        headRefOid: "b".repeat(40),
        number: 42,
        title: "Safe change",
      });
    }
    if (
      joined.startsWith("api") &&
      joined.includes("/compare/") &&
      !joined.includes("application/vnd.github.diff")
    ) {
      return JSON.stringify([...pages.values()].flat());
    }
    if (joined.startsWith("api") && joined.includes("/contents/")) {
      return JSON.stringify({
        content: Buffer.from("export const value = 1;\n").toString("base64"),
        encoding: "base64",
      });
    }
    if (joined.startsWith("api") && joined.includes("/compare/")) {
      return patch;
    }
    throw new Error(`Unexpected command: ${joined}`);
  });
}

it("should accept exactly 200 approved files from the same immutable comparison as the patch", async () => {
  const root = await makeRoot();
  const runner = createRunner(
    new Map([
      [1, Array.from({ length: 100 }, (_, index) => metadata(`src/a-${index}.ts`))],
      [2, Array.from({ length: 100 }, (_, index) => metadata(`src/b-${index}.ts`))],
      [3, []],
    ]),
  );

  const evidence = await readSafePullRequestEvidence(root, 42, runner);

  expect(evidence.changedPaths).toHaveLength(200);
  expect(runner).toHaveBeenCalledWith(
    expect.objectContaining({
      arguments_: expect.arrayContaining([
        expect.stringContaining(`/compare/${"a".repeat(40)}...${"b".repeat(40)}?per_page=1`),
      ]),
      root,
    }),
  );
});

it("should reject a pull request only when a 201st path exists", async () => {
  const root = await makeRoot();
  const runner = createRunner(
    new Map([
      [1, Array.from({ length: 100 }, (_, index) => metadata(`src/a-${index}.ts`))],
      [2, Array.from({ length: 100 }, (_, index) => metadata(`src/b-${index}.ts`))],
      [3, [metadata("src/overflow.ts")]],
    ]),
  );

  await expect(readSafePullRequestEvidence(root, 42, runner)).rejects.toThrow(
    "exceeds 200 changed paths",
  );
});

it("should return bounded head evidence only for approved changed paths", async () => {
  const root = await makeRoot();
  const runner = createRunner(new Map([[1, [metadata("src/file.ts")]]]));

  const evidence = await readSafePullRequestHeadEvidence(root, 42, ["src/file.ts"], runner);

  expect(evidence.files).toEqual([{ content: "export const value = 1;\n", path: "src/file.ts" }]);
  await expect(
    readSafePullRequestHeadEvidence(root, 42, ["src/not-changed.ts"], runner),
  ).rejects.toThrow("approved changed path");
});

it("should reject excluded PR paths before requesting the patch", async () => {
  const root = await makeRoot();
  const runner = createRunner(new Map([[1, [metadata("src/file.ts"), metadata(".env.secret")]]]));

  await expect(readSafePullRequestEvidence(root, 42, runner)).rejects.toThrow(
    "privacy-excluded paths",
  );
  expect(runner).not.toHaveBeenCalledWith(
    expect.objectContaining({
      arguments_: expect.arrayContaining(["Accept: application/vnd.github.diff"]),
    }),
  );
});

it("should reject excluded content at the captured revision even when the live PR has removed it", async () => {
  const root = await makeRoot();
  const stableRunner = createRunner(new Map([[1, [metadata("src/file.ts")]]]));
  const runner: PullRequestCommandRunner = vi.fn(async (command) => {
    if (
      command.arguments_.some((argument) => argument.includes("/compare/")) &&
      !command.arguments_.includes("Accept: application/vnd.github.diff")
    ) {
      return JSON.stringify([metadata("src/file.ts"), metadata("secrets/learner-records.txt")]);
    }
    return stableRunner(command);
  });
  await expect(readSafePullRequestEvidence(root, 42, runner)).rejects.toThrow(
    "privacy-excluded paths",
  );
  expect(runner).not.toHaveBeenCalledWith(
    expect.objectContaining({
      arguments_: expect.arrayContaining(["Accept: application/vnd.github.diff"]),
    }),
  );
});

it("should reject an oversized patch before returning evidence", async () => {
  const root = await makeRoot();
  const runner = createRunner(new Map([[1, [metadata("src/file.ts")]]]), "x".repeat(524_289));

  await expect(readSafePullRequestEvidence(root, 42, runner)).rejects.toThrow(
    "safe response limit",
  );
});

it("should reject a renamed file whose original comparison path was excluded", async () => {
  const root = await makeRoot();
  const stableRunner = createRunner(new Map([[1, [metadata("src/file.ts")]]]));
  const runner: PullRequestCommandRunner = vi.fn(async (command) => {
    if (command.arguments_.includes("--jq")) {
      return JSON.stringify([
        { filename: "src/file.ts", previousFilename: "secrets/record.txt", status: "renamed" },
      ]);
    }
    return stableRunner(command);
  });
  await expect(readSafePullRequestEvidence(root, 42, runner)).rejects.toThrow(
    "privacy-excluded paths",
  );
  expect(runner).not.toHaveBeenCalledWith(
    expect.objectContaining({
      arguments_: expect.arrayContaining(["Accept: application/vnd.github.diff"]),
    }),
  );
});

it("should return only net changes, not intermediate commit patches containing removed records", async () => {
  const root = await makeRoot();
  const stableRunner = createRunner(new Map([[1, [metadata("src/file.ts")]]]));
  const runner: PullRequestCommandRunner = async (command) => {
    if (command.arguments_.includes("Accept: application/vnd.github.patch")) {
      return "diff --git a/secrets/learner.txt b/secrets/learner.txt\n+SYNTHETIC_PRIVATE_RECORD\n";
    }
    return stableRunner(command);
  };
  const evidence = await readSafePullRequestEvidence(root, 42, runner);
  expect(evidence.patch).toContain("src/file.ts");
  expect(evidence.patch).not.toContain("SYNTHETIC_PRIVATE_RECORD");
});
