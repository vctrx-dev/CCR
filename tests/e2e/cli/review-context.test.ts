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
  await createCli(io).parseAsync(["node", "ccr", "context", "review-state"]);
  const reviewedState = JSON.parse(output);
  expect(reviewedState.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
  expect(reviewedState.contextFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
  expect(reviewedState.inputContextFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
  output = "";
  await createCli(io).parseAsync(["node", "ccr", "context", "review-context-state"]);
  const initialContextState = JSON.parse(output);
  expect(initialContextState.contextFingerprint).toBe(reviewedState.contextFingerprint);
  expect(initialContextState.inputContextFingerprint).toBe(reviewedState.inputContextFingerprint);
  const projectPath = path.join(root, ".ccr/project.md");
  const project = await readFile(projectPath, "utf8");
  await writeFile(projectPath, `${project}\nVerified context change.\n`, "utf8");
  output = "";
  await createCli(io).parseAsync(["node", "ccr", "context", "review-context-state"]);
  expect(JSON.parse(output).contextFingerprint).not.toBe(initialContextState.contextFingerprint);
  await writeFile(projectPath, project, "utf8");

  output = "";
  await createCli(io).parseAsync(["node", "ccr", "context", "review-journal"]);
  const first = JSON.parse(output);
  const journal = await readFile(path.join(root, first.path), "utf8");
  expect(journal).not.toContain("**Branch**");
  expect(journal).not.toContain("**Commit**");
  expect(journal).not.toContain("## Changed paths");
  await writeFile(
    path.join(root, first.path),
    `${journal.replace("Needs concise completion.", "Reviewed approved repository evidence.")}\n## Review run — 2026-08-27T01:00:00Z\n\n- **Scope**: changes\n- **Dimensions**: all\n- **Evidence**: approved live changes\n- **Finding counts**: critical=0, high=0, medium=0, low=0\n- **Outcomes**: no findings\n`,
    "utf8",
  );
  output = "";
  await createCli(io).parseAsync([
    "node",
    "ccr",
    "context",
    "record-review-state",
    first.path,
    reviewedState.fingerprint,
    reviewedState.contextFingerprint,
  ]);
  expect(output).toContain("Review state recorded");
  expect(await readFile(path.join(root, first.path), "utf8")).toContain(
    "**Review status**: current",
  );
  output = "";
  await createCli(io).parseAsync(["node", "ccr", "context", "review-journal"]);
  expect(JSON.parse(output)).toEqual(first);
}, 15_000);

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
  await createCli(io).parseAsync(["node", "ccr", "context", "review-context-state", "PR-42"]);
  const initialContext = JSON.parse(output);
  const target = path.join(root, first.path);
  await writeFile(target, `${await readFile(target, "utf8")}Prior PR outcome.\n`, "utf8");
  output = "";
  await createCli(io).parseAsync(["node", "ccr", "context", "review-context-state", "PR-42"]);
  const updatedContext = JSON.parse(output);
  expect(updatedContext.contextFingerprint).toBe(initialContext.contextFingerprint);
  expect(updatedContext.inputContextFingerprint).not.toBe(initialContext.inputContextFingerprint);
  output = "";
  await createCli(io).parseAsync(["node", "ccr", "context", "review-journal", "pr-42"]);
  expect(JSON.parse(output)).toEqual(first);

  output = "";
  await createCli(io).parseAsync(["node", "ccr", "context", "journals"]);
  const recent = JSON.parse(output);
  expect(recent.map(({ path: entryPath }: { path: string }) => entryPath)).toEqual([first.path]);
  output = "";
  await createCli(io).parseAsync(["node", "ccr", "context", "journals", "PR-42"]);
  expect(JSON.parse(output)).toEqual(recent);
});
