import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { createCli } from "../../../src/cli/index";
import { createTemporaryRootRegistry, runCommand } from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();

it("should expose privacy-filtered staged paths through the inspection CLI", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-inspection-cli-"));
  roots.push(root);
  await runCommand("git", ["init", "--quiet"], { cwd: root });
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
  await runCommand(
    "git",
    ["add", "--force", "--", ".ccr/config.json", "source.ts", ".env.review"],
    {
      cwd: root,
    },
  );

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
  await runCommand("git", ["init", "--quiet"], { cwd: root });
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

it("should append a decision only after the human enables the config opt-in", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-decisions-cli-"));
  roots.push(root);
  await runCommand("git", ["init", "--quiet"], { cwd: root });
  let output = "";
  const io = {
    cwd: root,
    write(message: string) {
      output += message;
    },
  };
  await createCli(io).parseAsync(["node", "ccr", "setup", "--apply"]);

  await expect(
    createCli(io).parseAsync([
      "node",
      "ccr",
      "context",
      "append-decision",
      "Keep reviews advisory.",
    ]),
  ).rejects.toThrow("instructions.updateDecisionsMd is false");

  await createCli(io).parseAsync([
    "node",
    "ccr",
    "config",
    "set",
    "instructions.updateDecisionsMd",
    "true",
    "--apply",
  ]);
  output = "";
  await createCli(io).parseAsync([
    "node",
    "ccr",
    "context",
    "append-decision",
    "Keep reviews advisory.",
  ]);

  expect(output).toBe("Decision recorded.\n");
  expect(await readFile(path.join(root, ".ccr/decisions.md"), "utf8")).toBe(
    "- Keep reviews advisory.\n",
  );
});
