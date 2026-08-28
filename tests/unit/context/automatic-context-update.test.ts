import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
    serializeContextConfig(DEFAULT_CONTEXT_CONFIG),
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

async function enableDecisionUpdates(root: string): Promise<void> {
  await writeFile(
    path.join(root, ".ccr/config.json"),
    serializeContextConfig({
      ...DEFAULT_CONTEXT_CONFIG,
      instructions: { ...DEFAULT_CONTEXT_CONFIG.instructions, updateDecisionsMd: true },
    }),
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
      shouldUpdateDecisions: false,
    });
    expect(await readFile(path.join(root, ".ccr/private/auto-update.json"), "utf8")).toContain(
      commit,
    );
    await expect(readFile(path.join(root, evidencePacketPath(commit)), "utf8")).rejects.toThrow();
  });

  it("should recognize a canonically complete journal after bounded state pruning", async () => {
    const root = await makeAutomationRoot();
    const commit = commitFor(root);
    const runClaude = vi.fn();
    await completeJournal(root);
    await mkdir(path.join(root, ".ccr/private"), { recursive: true });
    await writeFile(
      path.join(root, ".ccr/private/auto-update.json"),
      `${JSON.stringify({
        schemaVersion: 1,
        commits: Array.from({ length: 100 }, (_, index) => index.toString(16).padStart(40, "0")),
      })}\n`,
    );

    await expect(runUpdate(root, runClaude)).resolves.toEqual({ status: "already-updated" });
    expect(runClaude).not.toHaveBeenCalled();
  });

  it("should validate context before accepting a completed journal without state", async () => {
    const root = await makeAutomationRoot();
    await completeJournal(root);
    await writeFile(path.join(root, ".ccr/project.md"), "Invalid project context.\n");

    await expect(runUpdate(root, vi.fn())).rejects.toThrow(
      "Automatic context update left context invalid.",
    );
  });

  it("should accept one normalized append while preserving the decisions prefix", async () => {
    const root = await makeAutomationRoot();
    await enableDecisionUpdates(root);
    await writeFile(path.join(root, ".ccr/decisions.md"), "Existing decision.");
    const runner = vi.fn(async () => {
      await completeJournal(root);
      await writeFile(path.join(root, ".ccr/decisions.md"), "Existing decision.\n- Append once.\n");
    });

    await expect(runUpdate(root, runner)).resolves.toEqual({ status: "updated" });
  });

  it.each([
    ["replacement", "- Replacement.\n"],
    ["multiple appends", "- Existing.\n- First.\n- Second.\n"],
    ["multiline append", "- Existing.\n- First.\nContinuation.\n"],
    ["unnormalized append", "- Existing.\n-   Padded.  \n"],
    ["blank append", "- Existing.\n-   \n"],
    ["oversized append", `- Existing.\n- ${"x".repeat(10_001)}\n`],
  ])("should reject a %s to decisions", async (_case, replacement) => {
    const root = await makeAutomationRoot();
    await enableDecisionUpdates(root);
    await writeFile(path.join(root, ".ccr/decisions.md"), "- Existing.\n");
    await expect(
      runUpdate(root, async () => {
        await completeJournal(root);
        await writeFile(path.join(root, ".ccr/decisions.md"), replacement);
      }),
    ).rejects.toThrow("append-only boundary");
  });

  it.each([
    ["deletion", undefined],
    ["malformed UTF-8", Buffer.from([0xff])],
  ])("should reject decisions %s", async (_case, replacement) => {
    const root = await makeAutomationRoot();
    await enableDecisionUpdates(root);
    await writeFile(path.join(root, ".ccr/decisions.md"), "- Existing.\n");
    await expect(
      runUpdate(root, async () => {
        await completeJournal(root);
        replacement === undefined
          ? await rm(path.join(root, ".ccr/decisions.md"))
          : await writeFile(path.join(root, ".ccr/decisions.md"), replacement);
      }),
    ).rejects.toThrow("append-only boundary");
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

  it("should reject changes outside the approved context paths", async () => {
    const root = await makeAutomationRoot();
    await writeFile(path.join(root, "app.ts"), "before\n");
    const runner = vi.fn(async () => {
      await completeJournal(root);
      await writeFile(path.join(root, "app.ts"), "after\n");
    });

    await expect(runUpdate(root, runner)).rejects.toThrow(
      "Automatic context update changed an unauthorized path: app.ts.",
    );
  });

  it("should reject unauthorized ignored CCR files", async () => {
    const root = await makeAutomationRoot();
    const runner = vi.fn(async () => {
      await completeJournal(root);
      await writeFile(path.join(root, ".ccr/journal/main/extra.md"), "unexpected\n");
    });

    await expect(runUpdate(root, runner)).rejects.toThrow(
      "Automatic context update changed an unauthorized path: .ccr/journal/main/extra.md.",
    );
  });

  it("should reclaim an expired lock left by a dead process", async () => {
    const root = await makeAutomationRoot();
    await mkdir(path.join(root, ".ccr/private"), { recursive: true });
    await writeFile(
      path.join(root, ".ccr/private/managed-lifecycle.lock"),
      `${JSON.stringify({ pid: 999_999_999, createdAt: 946_684_800_000 })}\n`,
    );

    await expect(runUpdate(root, () => completeJournal(root))).resolves.toEqual({
      status: "updated",
    });
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

  it("should require the exact journal path", async () => {
    const root = await makeAutomationRoot();

    // @ts-expect-error Regression coverage for callers compiled against the former optional path.
    await expect(runAutomaticContextUpdate(root, commitFor(root), vi.fn())).rejects.toThrow();
  });

  it("should accept SHA-256 object IDs before checking repository identity", async () => {
    const root = await makeAutomationRoot();

    await expect(
      runAutomaticContextUpdate(root, "b".repeat(64), vi.fn(), JOURNAL_PATH),
    ).rejects.toThrow("Automatic context update commit no longer matches HEAD.");
  });

  it("should stop when HEAD changes during the headless update", async () => {
    const root = await makeAutomationRoot();
    const runner = vi.fn(async () => {
      await completeJournal(root);
      await writeFile(path.join(root, "next.txt"), "next\n");
      await runCommand("git", ["add", "next.txt"], { cwd: root });
      await runCommand("git", ["commit", "--quiet", "-m", "concurrent commit"], { cwd: root });
    });

    await expect(runUpdate(root, runner)).rejects.toThrow(
      "Automatic context update commit no longer matches HEAD.",
    );
  });

  it("should reject malformed or oversized completion state without exposing its content", async () => {
    const root = await makeAutomationRoot();
    await mkdir(path.join(root, ".ccr/private"), { recursive: true });
    await writeFile(
      path.join(root, ".ccr/private/auto-update.json"),
      `secret-${"x".repeat(11_000)}`,
    );

    await expect(runUpdate(root, vi.fn())).rejects.toThrow(
      "Automatic context update state is invalid.",
    );
  });

  it("should reject malformed UTF-8 in automatic state and journal files", async () => {
    const stateRoot = await makeAutomationRoot();
    await mkdir(path.join(stateRoot, ".ccr/private"), { recursive: true });
    await writeFile(
      path.join(stateRoot, ".ccr/private/auto-update.json"),
      Buffer.from([0x7b, 0xff, 0x7d]),
    );
    await expect(runUpdate(stateRoot, vi.fn())).rejects.toThrow(
      "Automatic context update state is invalid.",
    );

    const journalRoot = await makeAutomationRoot();
    await writeFile(path.join(journalRoot, JOURNAL_PATH), Buffer.from([0x23, 0x20, 0xff]));
    await expect(runUpdate(journalRoot, vi.fn())).rejects.toThrow(
      "Automatic context update journal is invalid.",
    );
  });

  it("should reject a journal with missing canonical completion metadata", async () => {
    const root = await makeAutomationRoot();
    const runner = vi.fn(async () => {
      await writeFile(
        path.join(root, JOURNAL_PATH),
        `# CCR Journal\n\n- **Commit**: \`${commitFor(root)}\`\n\n## Summary\n\nCompleted.\n`,
      );
    });

    await expect(runUpdate(root, runner)).rejects.toThrow(
      "Automatic context update did not complete its journal.",
    );
  });
});
