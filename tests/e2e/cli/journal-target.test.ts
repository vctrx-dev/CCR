import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import { createCli } from "../../../src/cli/index";
import {
  createTemporaryGitRepository,
  createTemporaryRootRegistry,
  runCommand,
} from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();

it("targets HEAD's context journal with unrelated working changes and excludes that active entry", async () => {
  const root = await createTemporaryGitRepository(roots, "ccr-commit-journal-cli-");
  const run = async (args: string[]) => {
    let output = "";
    await createCli({
      cwd: root,
      write: (text) => {
        output += text;
      },
    }).parseAsync(["node", "ccr", ...args]);
    return output;
  };
  await run(["setup"]);
  await writeFile(path.join(root, "feature.txt"), "committed feature\n");
  await runCommand("git", ["add", "."], { cwd: root });
  await runCommand("git", ["commit", "--quiet", "-m", "test: base"], { cwd: root });
  const head = (await runCommand("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  await writeFile(path.join(root, "feature.txt"), "unrelated later work\n");
  const working = JSON.parse(await run(["context", "review-journal"]));
  const committed = JSON.parse(await run(["context", "review-journal", "--commit", head]));
  expect(committed.path).not.toBe(working.path);
  const committedText = await readFile(path.join(root, committed.path), "utf8");
  expect(committedText).toContain(`- **Commit**: \`${head}\``);
  expect(await readFile(path.join(root, working.path), "utf8")).toContain("**Base commit**");
  await writeFile(
    path.join(root, committed.path),
    `${committedText}\nCommitted context was assessed.\n`,
  );
  const recent = await run(["context", "journals", "--commit", head]);
  expect(recent).not.toContain("Committed context was assessed.");
  expect(JSON.parse(await run(["context", "review-journal", "--commit", head])).path).toBe(
    committed.path,
  );
  for (const command of ["journals", "review-journal"]) {
    await expect(run(["context", command, "--commit", "HEAD"])).rejects.toThrow(
      "full current HEAD SHA",
    );
    await expect(run(["context", command, "--commit", "a".repeat(40)])).rejects.toThrow(
      "full current HEAD SHA",
    );
    await expect(run(["context", command, "PR-123", "--commit", head])).rejects.toThrow("not both");
  }
});
