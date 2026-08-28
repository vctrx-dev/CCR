import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  resolveClaudeExecutable,
  runHeadlessClaudeContextUpdate,
} from "../../../src/context/automatic-context-runner";
import { createTemporaryRootRegistry } from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();
const JOURNAL_PATH = ".ccr/journal/main/entry.md";

function evidencePacketPath(commit: string): string {
  return `.ccr/private/auto-update-evidence-${commit}.json`;
}

describe("automatic context runner", () => {
  it("should invoke Claude headlessly with bounded permissions and Git mutations denied", async () => {
    const executor = vi.fn().mockResolvedValue({ stdout: "done", stderr: "" });
    await runHeadlessClaudeContextUpdate(
      "C:/repository",
      JOURNAL_PATH,
      {
        commit: "a".repeat(40),
        evidencePacketPath: evidencePacketPath("a".repeat(40)),
        shouldUpdateDecisions: true,
      },
      executor,
      "claude-test",
    );
    const [command, args, options] = executor.mock.calls[0] ?? [];
    expect(command).toBe("claude-test");
    const systemPromptIndex = args.indexOf("--system-prompt");
    expect(systemPromptIndex).toBeGreaterThan(-1);
    expect(args[systemPromptIndex + 1]).toEqual(expect.any(String));
    expect(args).toContain("-p");
    expect(args).toContain("dontAsk");
    expect(args).toContain("--bare");
    expect(args).toContain("--no-session-persistence");
    expect(args).toContain("--setting-sources");
    expect(args).toContain("");
    expect(args).toContain("--strict-mcp-config");
    expect(args).toContain("Read,Edit");
    expect(args).toContain(
      `Read(/.ccr/config.json),Read(/.ccr/config-manual.md),Read(/.ccr/project.md),Read(/.ccr/stakeholders.md),Read(/.ccr/decisions.md),Read(/.ccr/journal/main/entry.md),Read(/.ccr/private/auto-update-evidence-${"a".repeat(40)}.json),Edit(/.ccr/journal/main/entry.md),Edit(/.ccr/project.md),Edit(/.ccr/decisions.md)`,
    );
    expect(args).not.toContain(expect.stringContaining("Bash"));
    expect(args).not.toContain(expect.stringContaining("Task"));
    expect(options).toMatchObject({
      cwd: "C:/repository",
      maxBuffer: 1_048_576,
      timeout: 600_000,
      windowsHide: true,
    });
  });

  it("should omit decision edit permission when the repository has not opted in", async () => {
    const executor = vi.fn().mockResolvedValue({ stdout: "done", stderr: "" });
    await runHeadlessClaudeContextUpdate(
      "C:/repository",
      JOURNAL_PATH,
      {
        commit: "a".repeat(40),
        evidencePacketPath: evidencePacketPath("a".repeat(40)),
        shouldUpdateDecisions: false,
      },
      executor,
      "claude-test",
    );
    const args = executor.mock.calls[0]?.[1] ?? [];
    const allowedTools = args[args.indexOf("--allowedTools") + 1];
    expect(allowedTools).toContain("Read(/.ccr/decisions.md)");
    expect(allowedTools).not.toContain("Edit(/.ccr/decisions.md)");
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
});
