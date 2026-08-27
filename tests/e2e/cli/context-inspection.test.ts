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

it("should expose privacy-filtered staged paths through the inspection CLI", async () => {
  const root = await createTemporaryGitRepository(roots, "ccr-inspection-cli-");
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

  output = "";
  await createCli(io).parseAsync(["node", "ccr", "context", "validate"]);
  expect(output).toContain("CCR context is valid");

  output = "";
  await createCli(io).parseAsync(["node", "ccr", "context", "status"]);
  expect(output).toContain("Staged repository files: yes");
  expect(output).toContain("Staged shared context: yes");
  expect(output).toContain("No context warning");
});

it("should read current shared context before it is committed and reject non-context files", async () => {
  const root = await createTemporaryGitRepository(roots, "ccr-shared-context-cli-");
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
  const root = await createTemporaryGitRepository(roots, "ccr-decisions-cli-");
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

it("should expose immutable privacy-filtered evidence for the exact HEAD commit", async () => {
  const root = await createTemporaryGitRepository(roots, "ccr-commit-evidence-cli-", "main");
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
  await writeFile(path.join(root, "source.ts"), "export const committed = true;\n", "utf8");
  await writeFile(path.join(root, ".env.review"), "SECRET=hidden\n", "utf8");
  await runCommand("git", ["add", "--force", "--", ".", ".env.review"], { cwd: root });
  await runCommand("git", ["commit", "--quiet", "-m", "test: evidence"], { cwd: root });
  const commit = (await runCommand("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  await writeFile(path.join(root, "source.ts"), "export const committed = false;\n", "utf8");

  output = "";
  await createCli(io).parseAsync(["node", "ccr", "context", "commit-changes", commit]);
  const changed = JSON.parse(output);
  expect(changed.paths).toContain("source.ts");
  expect(changed.paths).not.toContain(".env.review");

  output = "";
  await createCli(io).parseAsync(["node", "ccr", "context", "commit-read", commit, "source.ts"]);
  expect(output).toBe("export const committed = true;\n");
});

it("should expose indexed files, bounded reads, staged diffs, history, and journal creation", async () => {
  const root = await createTemporaryGitRepository(roots, "ccr-inspection-boundaries-cli-", "main");
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

  output = "";
  await createCli(io).parseAsync(["node", "ccr", "context", "files"]);
  expect(JSON.parse(output).paths).toContain("source.ts");
  output = "";
  await createCli(io).parseAsync(["node", "ccr", "context", "read", "source.ts"]);
  expect(output).toBe("export const value = 1;\n");

  await writeFile(path.join(root, "source.ts"), "export const value = 2;\n", "utf8");
  await runCommand("git", ["add", "--", "source.ts"], { cwd: root });
  output = "";
  await createCli(io).parseAsync(["node", "ccr", "context", "diff", "source.ts"]);
  expect(output).toContain("+export const value = 2;");
  output = "";
  await createCli(io).parseAsync(["node", "ccr", "context", "recent"]);
  expect(JSON.parse(output).paths).toContain("source.ts");
  output = "";
  await createCli(io).parseAsync(["node", "ccr", "context", "journal"]);
  expect(output).toMatch(/^Created \.ccr\/journal\/.+\.md\n$/u);
});
