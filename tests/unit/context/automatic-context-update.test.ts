import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  resolveClaudeExecutable,
  runAutomaticContextUpdate,
  runHeadlessClaudeContextUpdate,
} from "../../../src/context/automatic-context-update";
import { DEFAULT_CONTEXT_CONFIG, serializeContextConfig } from "../../../src/context/config";
import { createTemporaryRootRegistry, runCommand } from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();
const COMMIT = "a".repeat(40);
const JOURNAL_PATH = ".ccr/journal/main/entry.md";

async function makeAutomationRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-auto-context-"));
  roots.push(root);
  await runCommand("git", ["init", "--quiet", "-b", "main"], { cwd: root });
  await writeFile(path.join(root, ".gitignore"), ".ccr/journal/\n.ccr/private/\n");
  await mkdir(path.join(root, ".ccr/journal/main"), { recursive: true });
  await writeFile(
    path.join(root, ".ccr/config.json"),
    serializeContextConfig(DEFAULT_CONTEXT_CONFIG),
  );
  await writeFile(path.join(root, ".ccr/project.md"), "# Project\n");
  await writeFile(path.join(root, ".ccr/stakeholders.md"), "# Stakeholders\n");
  await writeFile(path.join(root, ".ccr/decisions.md"), "");
  await writeFile(path.join(root, ".ccr/config-manual.md"), "# CCR configuration manual\n");
  await writeFile(
    path.join(root, JOURNAL_PATH),
    `# CCR Journal\n\n- **Commit**: \`${COMMIT}\`\n\n## Summary\n\nNeeds concise completion.\n`,
  );
  return root;
}

async function completeJournal(root: string): Promise<void> {
  await writeFile(
    path.join(root, JOURNAL_PATH),
    `# CCR Journal\n\n- **Commit**: \`${COMMIT}\`\n\n## Summary\n\nCompleted.\n`,
  );
}

describe("runAutomaticContextUpdate", () => {
  it("should invoke Claude headlessly with bounded permissions and Git mutations denied", async () => {
    const executor = vi.fn().mockResolvedValue({ stdout: "done", stderr: "" });

    await runHeadlessClaudeContextUpdate(
      "C:/repository",
      ".ccr/journal/main/entry.md",
      executor,
      "claude-test",
    );

    const [command, args, options] = executor.mock.calls[0] ?? [];
    expect(command).toBe("claude-test");
    expect(args).toContain("-p");
    expect(args).toContain("acceptEdits");
    expect(args.join(" ")).toContain("Update only the existing HEAD journal");
    expect(args.join(" ")).toContain("Do not run ccr context journal");
    expect(args).toContain(
      "Read,Edit,Glob,Grep,Task,Bash(npx --no-install ccr config),Bash(npx --no-install ccr context:*)",
    );
    expect(args).toContain(
      "Write,Bash(git:*),Bash(npx --no-install ccr config set:*),Bash(npx --no-install ccr uninstall:*)",
    );
    expect(options).toMatchObject({
      cwd: "C:/repository",
      maxBuffer: 1_048_576,
      timeout: 600_000,
      windowsHide: true,
    });
  });

  it("should resolve the npm native Claude executable on Windows without a shell", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ccr-claude-executable-"));
    roots.push(root);
    const executable = path.join(root, "node_modules/@anthropic-ai/claude-code/bin/claude.exe");
    await mkdir(path.dirname(executable), { recursive: true });
    await writeFile(executable, "");

    expect(resolveClaudeExecutable("win32", root)).toBe(executable);
    expect(resolveClaudeExecutable("linux", root)).toBe("claude");
  });

  it("should run Claude once for a commit and persist completion only after success", async () => {
    const root = await makeAutomationRoot();
    const runClaude = vi.fn(() => completeJournal(root));

    expect(await runAutomaticContextUpdate(root, COMMIT, runClaude, JOURNAL_PATH)).toEqual({
      status: "updated",
    });
    expect(await runAutomaticContextUpdate(root, COMMIT, runClaude, JOURNAL_PATH)).toEqual({
      status: "already-updated",
    });
    expect(runClaude).toHaveBeenCalledTimes(1);
    expect(await readFile(path.join(root, ".ccr/private/auto-update.json"), "utf8")).toContain(
      COMMIT,
    );
  });

  it("should remain retryable when Claude fails", async () => {
    const root = await makeAutomationRoot();
    const runClaude = vi.fn().mockRejectedValue(new Error("private upstream response"));

    await expect(runAutomaticContextUpdate(root, COMMIT, runClaude, JOURNAL_PATH)).rejects.toThrow(
      "Automatic context update failed.",
    );
    await expect(
      readFile(path.join(root, ".ccr/private/auto-update.json"), "utf8"),
    ).rejects.toThrow();
  });

  it("should reject a successful process that leaves the journal incomplete", async () => {
    const root = await makeAutomationRoot();

    await expect(
      runAutomaticContextUpdate(root, COMMIT, vi.fn().mockResolvedValue(undefined), JOURNAL_PATH),
    ).rejects.toThrow("Automatic context update did not complete its journal.");
    await expect(
      readFile(path.join(root, ".ccr/private/auto-update.json"), "utf8"),
    ).rejects.toThrow();
  });

  it("should reject changes outside the approved context paths", async () => {
    const root = await makeAutomationRoot();
    await writeFile(path.join(root, "app.ts"), "before\n");
    const runner = vi.fn(async () => {
      await completeJournal(root);
      await writeFile(path.join(root, "app.ts"), "after\n");
    });

    await expect(runAutomaticContextUpdate(root, COMMIT, runner, JOURNAL_PATH)).rejects.toThrow(
      "Automatic context update changed an unauthorized path: app.ts.",
    );
  });

  it("should reject unauthorized ignored CCR files", async () => {
    const root = await makeAutomationRoot();
    const runner = vi.fn(async () => {
      await completeJournal(root);
      await writeFile(path.join(root, ".ccr/journal/main/extra.md"), "unexpected\n");
    });

    await expect(runAutomaticContextUpdate(root, COMMIT, runner, JOURNAL_PATH)).rejects.toThrow(
      "Automatic context update changed an unauthorized path: .ccr/journal/main/extra.md.",
    );
  });

  it("should reclaim an expired lock left by a dead process", async () => {
    const root = await makeAutomationRoot();
    await mkdir(path.join(root, ".ccr/private"), { recursive: true });
    await writeFile(
      path.join(root, ".ccr/private/auto-update.lock"),
      `${JSON.stringify({ pid: 999_999_999, createdAt: 946_684_800_000 })}\n`,
    );

    await expect(
      runAutomaticContextUpdate(root, COMMIT, () => completeJournal(root), JOURNAL_PATH),
    ).resolves.toEqual({ status: "updated" });
  });

  it("should prevent concurrent hook processes from starting duplicate runs", async () => {
    const root = await makeAutomationRoot();
    let finish: (() => void) | undefined;
    const first = runAutomaticContextUpdate(
      root,
      COMMIT,
      async () =>
        new Promise<void>((resolve) => {
          finish = () => {
            void completeJournal(root).then(resolve);
          };
        }),
      JOURNAL_PATH,
    );
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"), { timeout: 10_000 });

    expect(await runAutomaticContextUpdate(root, COMMIT, vi.fn(), JOURNAL_PATH)).toEqual({
      status: "in-progress",
    });
    finish?.();
    await expect(first).resolves.toEqual({ status: "updated" });
  });
});
