import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runAutomaticContextUpdate } from "../../../src/context/automatic-context-update";
import { DEFAULT_CONTEXT_CONFIG, serializeContextConfig } from "../../../src/context/config";
import { createTemporaryRootRegistry, runCommand } from "../../helpers/test-environment";

vi.mock("../../../src/context/automatic-context-evidence", () => ({
  buildAutomaticContextEvidencePacket: vi.fn(
    async (_root: string, commit: string) =>
      `${JSON.stringify({ schemaVersion: 1, commit, excludedPathCount: 0, files: [] })}\n`,
  ),
}));

const roots = createTemporaryRootRegistry();
const JOURNAL_PATH = ".ccr/journal/main/entry.md";
const commits = new Map<string, string>();

function evidencePacketPath(commit: string): string {
  return `.ccr/private/auto-update-evidence-${commit}.json`;
}

function commitFor(root: string): string {
  const commit = commits.get(root);
  if (commit === undefined) throw new Error("Test repository commit is unavailable.");
  return commit;
}

function runUpdate(root: string, runner: Parameters<typeof runAutomaticContextUpdate>[2]) {
  return runAutomaticContextUpdate(root, commitFor(root), runner, JOURNAL_PATH);
}

async function makeAutomationRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-auto-context-"));
  roots.push(root);
  await runCommand("git", ["init", "--quiet", "-b", "main"], { cwd: root });
  await writeFile(path.join(root, ".gitignore"), ".ccr/journal/\n.ccr/private/\n");
  await mkdir(path.join(root, ".ccr/journal/main"), { recursive: true });
  await writeFile(
    path.join(root, ".ccr/config.json"),
    serializeContextConfig({
      ...DEFAULT_CONTEXT_CONFIG,
      instructions: { ...DEFAULT_CONTEXT_CONFIG.instructions, updateDecisionsMd: false },
    }),
  );
  await writeFile(path.join(root, ".ccr/project.md"), "# Project\n");
  await writeFile(path.join(root, ".ccr/stakeholders.md"), "# Stakeholders\n");
  await writeFile(path.join(root, ".ccr/decisions.md"), "");
  await writeFile(path.join(root, ".ccr/config-manual.md"), "# CCR configuration manual\n");
  await runCommand("git", ["config", "user.email", "ccr@example.test"], { cwd: root });
  await runCommand("git", ["config", "user.name", "CCR Tests"], { cwd: root });
  await runCommand("git", ["add", "."], { cwd: root });
  await runCommand("git", ["commit", "--quiet", "-m", "test fixture"], { cwd: root });
  const { stdout } = await runCommand("git", ["rev-parse", "HEAD"], { cwd: root });
  const commit = stdout.trim();
  commits.set(root, commit);
  await writeFile(
    path.join(root, JOURNAL_PATH),
    `# CCR Journal\n\n- **Started**: 2026-08-27T01:00:00Z\n- **Updated**: 2026-08-27T01:00:00Z\n- **Commit**: \`${commit}\`\n\n## Summary\n\nNeeds concise completion.\n\n## Findings and outcomes\n\n- Addressed: none.\n- Deferred: none.\n- Questioned: none.\n- Rejected: none.\n`,
  );
  return root;
}

async function completeJournal(root: string): Promise<void> {
  await writeFile(
    path.join(root, JOURNAL_PATH),
    `# CCR Journal\n\n- **Started**: 2026-08-27T01:00:00Z\n- **Updated**: 2026-08-27T01:01:00Z\n- **Commit**: \`${commitFor(root)}\`\n\n## Summary\n\nCompleted.\n\n## Findings and outcomes\n\n- Addressed: journal completed.\n- Deferred: none.\n- Questioned: none.\n- Rejected: none.\n`,
  );
}

describe("runAutomaticContextUpdate", () => {
  it("should run Claude once for a commit and persist completion only after success", async () => {
    const root = await makeAutomationRoot();
    const commit = commitFor(root);
    const runClaude = vi.fn(() => completeJournal(root));

    expect(await runUpdate(root, runClaude)).toEqual({ status: "updated" });
    expect(await runUpdate(root, runClaude)).toEqual({ status: "already-updated" });
    expect(runClaude).toHaveBeenCalledTimes(1);
    expect(runClaude).toHaveBeenCalledWith(root, JOURNAL_PATH, {
      commit,
      evidencePacketPath: evidencePacketPath(commit),
      shouldUpdateDecisions: true,
    });
    expect(await readFile(path.join(root, ".ccr/private/auto-update.json"), "utf8")).toContain(
      commit,
    );
    await expect(readFile(path.join(root, evidencePacketPath(commit)), "utf8")).rejects.toThrow();
  });

  it("should remain retryable when Claude fails", async () => {
    const root = await makeAutomationRoot();
    const commit = commitFor(root);
    const runClaude = vi.fn().mockRejectedValue(new Error("private upstream response"));

    await expect(runUpdate(root, runClaude)).rejects.toThrow("Automatic context update failed.");
    await expect(
      readFile(path.join(root, ".ccr/private/auto-update.json"), "utf8"),
    ).rejects.toThrow();
    await expect(readFile(path.join(root, evidencePacketPath(commit)), "utf8")).rejects.toThrow();
  });

  it("should reject a successful process that leaves the journal incomplete", async () => {
    const root = await makeAutomationRoot();
    await expect(runUpdate(root, vi.fn().mockResolvedValue(undefined))).rejects.toThrow(
      "Automatic context update did not complete its journal.",
    );
    await expect(
      readFile(path.join(root, ".ccr/private/auto-update.json"), "utf8"),
    ).rejects.toThrow();
  });

  it("should reject changes to CCR files outside the approved context paths", async () => {
    const root = await makeAutomationRoot();
    const runner = vi.fn(async () => {
      await completeJournal(root);
      await writeFile(path.join(root, ".ccr/stakeholders.md"), "# Stakeholders\n\nEdited.\n");
    });

    await expect(runUpdate(root, runner)).rejects.toThrow(
      "Automatic context update changed an unauthorized path: .ccr/stakeholders.md.",
    );
  });

  it("should prevent concurrent hook processes from starting duplicate runs", async () => {
    const root = await makeAutomationRoot();
    let finish: (() => void) | undefined;
    const first = runUpdate(
      root,
      async () =>
        new Promise<void>((resolve) => {
          finish = () => {
            void completeJournal(root).then(resolve);
          };
        }),
    );
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"), { timeout: 10_000 });

    expect(await runUpdate(root, vi.fn())).toEqual({ status: "in-progress" });
    finish?.();
    await expect(first).resolves.toEqual({ status: "updated" });
  });

  it("should finish when a new commit lands on top during the headless update", async () => {
    const root = await makeAutomationRoot();
    const runner = vi.fn(async () => {
      await completeJournal(root);
      await writeFile(path.join(root, "next.txt"), "next\n");
      await runCommand("git", ["add", "next.txt"], { cwd: root });
      await runCommand("git", ["commit", "--quiet", "-m", "concurrent commit"], { cwd: root });
    });

    await expect(runUpdate(root, runner)).resolves.toEqual({ status: "updated" });
  });
});
