import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";
import { createCli } from "../../../src/cli/index";

const run = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

it("should expose review evidence and reuse the current-commit journal through the CLI", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-review-cli-"));
  roots.push(root);
  await run("git", ["init", "--quiet", "-b", "main"], { cwd: root });
  await run("git", ["config", "user.name", "CCR Test"], { cwd: root });
  await run("git", ["config", "user.email", "ccr@example.test"], { cwd: root });
  let output = "";
  const io = {
    cwd: root,
    write(message: string) {
      output += message;
    },
  };
  await createCli(io).parseAsync(["node", "ccr", "setup", "--apply"]);
  await writeFile(path.join(root, "source.ts"), "export const value = 1;\n", "utf8");
  await run("git", ["add", "--", ".ccr", ".gitignore", "source.ts"], { cwd: root });
  await run("git", ["commit", "--quiet", "-m", "test: seed"], { cwd: root });
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
