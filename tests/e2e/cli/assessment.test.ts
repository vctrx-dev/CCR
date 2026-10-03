import { writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import { createCli } from "../../../src/cli/index";
import {
  createTemporaryGitRepository,
  createTemporaryRootRegistry,
  runCommand,
} from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();

it("should acknowledge an assessment performed after committing and reject an old commit target", async () => {
  const root = await createTemporaryGitRepository(roots, "ccr-committed-assessment-");
  let output = "";
  const io = {
    cwd: root,
    write: (text: string) => {
      output += text;
    },
  };
  const run = async (args: string[]) => {
    output = "";
    await createCli(io).parseAsync(["node", "ccr", ...args]);
    return output;
  };
  await run(["setup"]);
  await writeFile(path.join(root, "feature.txt"), "base\n");
  await runCommand("git", ["add", "."], { cwd: root });
  await runCommand("git", ["commit", "--quiet", "-m", "test: base"], { cwd: root });
  await writeFile(path.join(root, "feature.txt"), "committed change\n");
  await runCommand("git", ["add", "feature.txt"], { cwd: root });
  await runCommand("git", ["commit", "--quiet", "-m", "test: change"], { cwd: root });
  const commit = (await runCommand("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  const state = JSON.parse(await run(["context", "review-state", "--commit", commit]));
  expect(state.pathCount).toBe(1);
  await run([
    "context",
    "assess",
    state.fingerprint,
    state.contextFingerprint,
    "No durable product change.",
    "--commit",
    commit,
  ]);
  expect(await run(["hooks", "post-commit"])).not.toContain(
    "without a matching context assessment",
  );
  await runCommand("git", ["commit", "--allow-empty", "--quiet", "-m", "test: next"], {
    cwd: root,
  });
  await expect(
    run([
      "context",
      "assess",
      state.fingerprint,
      state.contextFingerprint,
      "Old assessment.",
      "--commit",
      commit,
    ]),
  ).rejects.toThrow("current HEAD");
});
