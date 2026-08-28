import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { createTemporaryRootRegistry, runCommand } from "../../helpers/test-environment";

const readSafePullRequestEvidenceMock = vi.hoisted(() => vi.fn());
const readSafePullRequestHeadEvidenceMock = vi.hoisted(() => vi.fn());

vi.mock("../../../src/review/pr-evidence", () => ({
  readSafePullRequestEvidence: readSafePullRequestEvidenceMock,
  readSafePullRequestHeadEvidence: readSafePullRequestHeadEvidenceMock,
}));

const roots = createTemporaryRootRegistry();

it("should expose bounded PR and head evidence through context commands", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-pr-cli-"));
  roots.push(root);
  await runCommand("git", ["init", "--quiet"], { cwd: root });
  readSafePullRequestEvidenceMock.mockResolvedValue({ changedPaths: ["src/file.ts"] });
  readSafePullRequestHeadEvidenceMock.mockResolvedValue({
    files: [{ content: "export {};\n", path: "src/file.ts" }],
  });
  const { createCli } = await import("../../../src/cli/index");
  const repositoryRoot = root.replaceAll("\\", "/");
  let output = "";
  const io = {
    cwd: root,
    write(message: string) {
      output += message;
    },
  };

  await createCli(io).parseAsync(["node", "ccr", "context", "review-pr", "PR-42"]);
  expect(JSON.parse(output)).toEqual({ changedPaths: ["src/file.ts"] });
  expect(readSafePullRequestEvidenceMock).toHaveBeenCalledWith(repositoryRoot, 42);

  output = "";
  await createCli(io).parseAsync([
    "node",
    "ccr",
    "context",
    "review-pr-head",
    "PR-42",
    "src/file.ts",
  ]);
  expect(JSON.parse(output).files).toEqual([{ content: "export {};\n", path: "src/file.ts" }]);
  expect(readSafePullRequestHeadEvidenceMock).toHaveBeenCalledWith(repositoryRoot, 42, [
    "src/file.ts",
  ]);
});
