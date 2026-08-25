import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { createCli } from "../../../src/cli/index";
import { createTemporaryRootRegistry, runCommand } from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();

it("should expose review evidence and reuse the current-commit journal through the CLI", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-review-cli-"));
  roots.push(root);
  await runCommand("git", ["init", "--quiet", "-b", "main"], { cwd: root });
  await runCommand("git", ["config", "user.name", "CCR Test"], { cwd: root });
  await runCommand("git", ["config", "user.email", "ccr@example.test"], { cwd: root });
  let output = "";
  const io = {
    cwd: root,
    write(message: string) {
      output += message;
    },
  };
  await createCli(io).parseAsync(["node", "ccr", "setup", "--apply"]);
  await writeFile(path.join(root, "source.ts"), "export const value = 1;\n", "utf8");
  await runCommand("git", ["add", "--", ".ccr", ".gitignore", "source.ts"], { cwd: root });
  await runCommand("git", ["commit", "--quiet", "-m", "test: seed"], { cwd: root });
  await writeFile(path.join(root, "source.ts"), "export const value = 2;\n", "utf8");

  output = "";
  await createCli(io).parseAsync(["node", "ccr", "context", "review-changes"]);
  expect(JSON.parse(output).unstagedPaths).toEqual(["source.ts"]);

  output = "";
  await createCli(io).parseAsync(["node", "ccr", "context", "review-diff", "source.ts"]);
  expect(output).toContain("## Unstaged diff");
  expect(output).toContain("value = 2");

  output = "";
  await createCli(io).parseAsync(["node", "ccr", "context", "review-journal"]);
  const first = JSON.parse(output);
  const journal = await readFile(path.join(root, first.path), "utf8");
  expect(journal).not.toContain("**Branch**");
  expect(journal).not.toContain("**Commit**");
  expect(journal).not.toContain("## Changed paths");
  output = "";
  await createCli(io).parseAsync(["node", "ccr", "context", "review-journal"]);
  expect(JSON.parse(output)).toEqual(first);
}, 10_000);

it("should reuse one journal entry for a pull request through the CLI", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-pr-journal-cli-"));
  roots.push(root);
  await runCommand("git", ["init", "--quiet", "-b", "main"], { cwd: root });
  let output = "";
  const io = {
    cwd: root,
    write(message: string) {
      output += message;
    },
  };
  await createCli(io).parseAsync(["node", "ccr", "setup", "--apply"]);

  await expect(
    createCli(io).parseAsync(["node", "ccr", "context", "review-journal", "PR-0"]),
  ).rejects.toThrow("Pull request must use PR-<positive number>");

  output = "";
  await createCli(io).parseAsync(["node", "ccr", "context", "review-journal", "PR-42"]);
  const first = JSON.parse(output);
  output = "";
  await createCli(io).parseAsync(["node", "ccr", "context", "review-journal", "pr-42"]);
  expect(JSON.parse(output)).toEqual(first);

  output = "";
  await createCli(io).parseAsync(["node", "ccr", "context", "journals", "PR-42"]);
  expect(JSON.parse(output).map(({ path: entryPath }: { path: string }) => entryPath)).toEqual([
    first.path,
  ]);
});
