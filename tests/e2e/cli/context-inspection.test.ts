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

it("should expose privacy-filtered staged paths through the inspection CLI", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-inspection-cli-"));
  roots.push(root);
  await run("git", ["init", "--quiet"], { cwd: root });
  let output = "";
  const io = {
    cwd: root,
    write(message: string) {
      output += message;
    },
  };
  await createCli(io).parseAsync(["node", "ccr", "setup", "--apply"]);
  await writeFile(path.join(root, "source.ts"), "export {};\n", "utf8");
  await writeFile(path.join(root, ".env.review"), "SECRET=hidden\n", "utf8");
  await run("git", ["add", "--force", "--", ".ccr/config.json", "source.ts", ".env.review"], {
    cwd: root,
  });

  output = "";
  await createCli(io).parseAsync(["node", "ccr", "context", "changes"]);
  const result = JSON.parse(output);
  expect(result.allowedStagedPaths).toContain("source.ts");
  expect(result.allowedStagedPaths).not.toContain(".env.review");
  expect(result.excludedPathCount).toBe(1);
});

it("should read current shared context before it is committed and reject non-context files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-shared-context-cli-"));
  roots.push(root);
  await run("git", ["init", "--quiet"], { cwd: root });
  let output = "";
  const io = {
    cwd: root,
    write(message: string) {
      output += message;
    },
  };
  await createCli(io).parseAsync(["node", "ccr", "setup", "--apply"]);
  const projectPath = path.join(root, ".ccr/project.md");
  await writeFile(projectPath, "# Current uncommitted plan\n", "utf8");

  output = "";
  await createCli(io).parseAsync(["node", "ccr", "context", "shared", ".ccr/project.md"]);
  expect(output).toBe("# Current uncommitted plan\n");
  expect(await readFile(projectPath, "utf8")).toBe(output);

  await expect(
    createCli(io).parseAsync(["node", "ccr", "context", "shared", ".ccr/config.json"]),
  ).rejects.toThrow(/approved shared context/i);
});
