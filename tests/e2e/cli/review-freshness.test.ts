import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { createCli } from "../../../src/cli/index";
import { ensureWorkingJournalEntry } from "../../../src/context/journal";
import {
  computeWorkingReviewState,
  recordWorkingReviewState,
} from "../../../src/review/review-state";
import { createTemporaryRootRegistry, runCommand } from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();

it("should warn when staged review evidence changed after the latest recorded review", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-hooks-stale-review-"));
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
  await createCli(io).parseAsync(["node", "ccr", "config", "init", "--apply"]);
  await mkdir(path.join(root, ".ccr"), { recursive: true });
  await writeFile(path.join(root, "source.ts"), "export const value = 1;\n", "utf8");
  await runCommand("git", ["add", "--", ".ccr/config.json", "source.ts"], { cwd: root });
  await runCommand("git", ["commit", "--quiet", "-m", "test: seed"], { cwd: root });
  await writeFile(path.join(root, "source.ts"), "export const value = 2;\n", "utf8");
  const state = await computeWorkingReviewState(root);
  const journal = await ensureWorkingJournalEntry(root);
  const journalTarget = path.join(root, journal.path);
  await writeFile(
    journalTarget,
    `${(await readFile(journalTarget, "utf8")).replace("Needs concise completion.", "Reviewed approved repository evidence.")}\n## Review run — 2026-08-27T01:00:00Z\n\n- **Scope**: changes\n- **Dimensions**: all\n- **Evidence**: approved live changes\n- **Finding counts**: critical=0, high=0, medium=0, low=0\n- **Outcomes**: no findings\n`,
    "utf8",
  );
  await recordWorkingReviewState(root, journal.path, state.fingerprint, state.contextFingerprint);
  await writeFile(path.join(root, "source.ts"), "export const value = 3;\n", "utf8");
  await runCommand("git", ["add", "--", "source.ts"], { cwd: root });

  output = "";
  await createCli(io).parseAsync(["node", "ccr", "hooks", "pre-commit"]);

  expect(output).toBe("CCR: staged code changed after the last /ccr-review.\n");
}, 30_000);

it("should refuse CLI save-review for code edited after the captured review state", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-save-review-expected-"));
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
  await createCli(io).parseAsync(["node", "ccr", "context", "review-state"]);
  const captured = JSON.parse(output);
  await writeFile(path.join(root, "source.ts"), "export const value = 3;\n", "utf8");
  const save = [
    "node",
    "ccr",
    "context",
    "save-review",
    "changes",
    "all",
    "0,0,0,0",
    "No supported issues.",
    "--expected-state",
    captured.fingerprint,
    "--expected-context",
    captured.contextFingerprint,
  ];

  await expect(createCli(io).parseAsync(save)).rejects.toThrow(
    "changed since review-state was captured",
  );
  await writeFile(path.join(root, "source.ts"), "export const value = 2;\n", "utf8");
  output = "";
  await createCli(io).parseAsync(save);
  expect(output).toContain("Review saved to");
}, 30_000);

it("should warn and mark stale when only shared context changes after review", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-hooks-stale-context-review-"));
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
  const state = await computeWorkingReviewState(root);
  const journal = await ensureWorkingJournalEntry(root);
  const journalTarget = path.join(root, journal.path);
  await writeFile(
    journalTarget,
    `${(await readFile(journalTarget, "utf8")).replace("Needs concise completion.", "Reviewed approved repository evidence.")}\n## Review run — 2026-08-27T01:00:00Z\n\n- **Scope**: changes\n- **Dimensions**: all\n- **Evidence**: approved live changes\n- **Finding counts**: critical=0, high=0, medium=0, low=0\n- **Outcomes**: no findings\n`,
    "utf8",
  );
  await recordWorkingReviewState(root, journal.path, state.fingerprint, state.contextFingerprint);

  await writeFile(path.join(root, ".ccr/project.md"), "# Project\n\nChanged context.\n", "utf8");
  await runCommand("git", ["add", "--", ".ccr/project.md"], { cwd: root });
  output = "";
  await createCli(io).parseAsync(["node", "ccr", "hooks", "pre-commit"]);
  expect(output).toBe("CCR: staged code changed after the last /ccr-review.\n");

  await runCommand("git", ["commit", "--quiet", "-m", "docs: update context"], { cwd: root });
  output = "";
  await createCli(io).parseAsync(["node", "ccr", "hooks", "post-commit"]);
  expect(output).toBe("");
  expect(await readFile(journalTarget, "utf8")).toContain("**Review status**: stale");
}, 30_000);

it("should stay quiet when the commit holds only reviewed files and other work stays uncommitted", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-hooks-subset-review-"));
  roots.push(root);
  await runCommand("git", ["init", "--quiet", "-b", "main"], { cwd: root });
  await runCommand("git", ["config", "user.name", "CCR Test"], { cwd: root });
  await runCommand("git", ["config", "user.email", "ccr@example.test"], { cwd: root });
  let output = "";
  const run = async (args: string[]) => {
    output = "";
    await createCli({
      cwd: root,
      write(message: string) {
        output += message;
      },
    }).parseAsync(["node", "ccr", ...args]);
    return output;
  };
  await run(["setup"]);
  await writeFile(path.join(root, "source.ts"), "export const value = 1;\n", "utf8");
  await runCommand("git", ["add", "."], { cwd: root });
  await runCommand("git", ["commit", "--quiet", "-m", "test: seed"], { cwd: root });
  await writeFile(path.join(root, "source.ts"), "export const value = 2;\n", "utf8");
  await writeFile(path.join(root, "scratch.txt"), "personal notes\n", "utf8");
  const state = JSON.parse(await run(["context", "review-state"]));
  const saveArgs = ["context", "save-review", "changes", "all", "0,0,0,0", "No issues."];
  const expected = [
    "--expected-state",
    state.fingerprint,
    "--expected-context",
    state.contextFingerprint,
  ];
  const journalPath = (await run([...saveArgs, ...expected]))
    .replace("Review saved to ", "")
    .trim()
    .replace(/\.$/u, "");
  await run(["context", "assess", state.fingerprint, state.contextFingerprint, "No change."]);
  await runCommand("git", ["add", "--", "source.ts"], { cwd: root });

  expect(await run(["hooks", "pre-commit"])).toBe("");
  await runCommand("git", ["commit", "--quiet", "-m", "feat: value"], { cwd: root });
  expect(await run(["hooks", "post-commit"])).toBe("");
  const journal = await readFile(path.join(root, journalPath), "utf8");
  expect(journal).toContain("**Commit**:");
  expect(journal).toContain("**Review status**: current");
}, 30_000);
