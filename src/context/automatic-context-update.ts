import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import {
  assertSafeManagedPath,
  fingerprintManagedTree,
  readBoundedTextIfExists,
  readManagedTextIfExists,
  tryAcquireManagedLock,
  writeManagedText,
} from "./files";
import { readWorkingTreeFingerprints } from "./git";
import { readResolvedContextConfig } from "./privacy";
import { validateContext } from "./validate";

/**
 * Opt-in headless Claude boundary for post-commit continuity updates. The completion record is local
 * and commit-scoped so repeated hook execution cannot rerun a successful update.
 */

const execFileAsync = promisify(execFile);
const STATE_PATH = ".ccr/private/auto-update.json";
const LOCK_PATH = ".ccr/private/auto-update.lock";
const commitSchema = z.string().regex(/^[a-f0-9]{40}$/);
const journalPathSchema = z
  .string()
  .min(1)
  .max(500)
  .regex(/^\.ccr\/journal\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\.md$/u);
const stateSchema = z.object({
  schemaVersion: z.literal(1),
  commits: z.array(commitSchema).max(100),
});

export type ClaudeContextRunner = (root: string, journalPath?: string) => Promise<void>;

/** Resolves npm's native Windows Claude binary so automation never needs a command shell. */
export function resolveClaudeExecutable(
  platform: NodeJS.Platform = process.platform,
  pathValue: string = process.env.PATH ?? "",
): string {
  if (platform !== "win32") return "claude";
  const directories = pathValue.split(path.delimiter).slice(0, 100);
  for (const rawDirectory of directories) {
    const directory = rawDirectory.trim().replace(/^"|"$/g, "");
    if (!path.isAbsolute(directory) || directory.length > 1_000) continue;
    const candidates = [
      path.join(directory, "claude.exe"),
      path.join(directory, "node_modules/@anthropic-ai/claude-code/bin/claude.exe"),
    ];
    const executable = candidates.find((candidate) => existsSync(candidate));
    if (executable) return executable;
  }
  throw new Error("Claude Code executable is unavailable.");
}

/** Invokes Claude Code with bounded output and only the tools required by the context skill. */
export async function runHeadlessClaudeContextUpdate(
  root: string,
  journalPath?: string,
  executor: typeof execFileAsync = execFileAsync,
  executable: string = resolveClaudeExecutable(),
): Promise<void> {
  const journalInstruction = journalPath
    ? `Update only the existing HEAD journal at ${journalPath}. Do not run ccr context journal and do not create, complete, or modify any other journal.`
    : "Update only the existing journal for HEAD. Do not create or modify a working-tree journal.";
  const prompt = [
    "<role>You are the repository's CCR context maintainer.</role>",
    "<task>Use the ccr-context skill to update context for the last commit of this branch.</task>",
    "<workflow>Run non-interactively. Read all required shared context and recent journals, then",
    `${journalInstruction} Update project.md only for durable high-level context.`,
    "Keep stakeholders.md unchanged. Append a decision only when the configured opt-in and strict",
    "durable-decision rule allow it.</workflow>",
    "<constraints>Finish without questions or permission requests. Leave .ccr/config.json unchanged.",
    "Edit only the exact journal path, .ccr/project.md, and an opted-in .ccr/decisions.md; do not",
    "edit source, stakeholders, configuration, private state, or any other journal.",
    "Leave all changes unstaged and create no commit, amend, reset, or push.</constraints>",
    "<success>Finish only after the journal is complete and any justified context edit validates.</success>",
  ].join(" ");
  try {
    await executor(
      executable,
      [
        "-p",
        prompt,
        "--permission-mode",
        "acceptEdits",
        "--allowedTools",
        "Read,Edit,Glob,Grep,Task,Bash(npx --no-install ccr config),Bash(npx --no-install ccr context:*)",
        "--disallowedTools",
        "Write,Bash(git:*),Bash(npx --no-install ccr config set:*),Bash(npx --no-install ccr uninstall:*)",
        "--max-turns",
        "50",
      ],
      { cwd: root, encoding: "utf8", maxBuffer: 1_048_576, timeout: 600_000, windowsHide: true },
    );
  } catch {
    throw new Error("Automatic context update failed.");
  }
}

function changedUnauthorizedPath(
  before: Map<string, string>,
  after: Map<string, string>,
  allowedPaths: ReadonlySet<string>,
): string | undefined {
  for (const relativePath of new Set([...before.keys(), ...after.keys()])) {
    if (allowedPaths.has(relativePath)) continue;
    if (before.get(relativePath) !== after.get(relativePath)) return relativePath;
  }
  return undefined;
}

async function readUpdateFingerprints(root: string): Promise<Map<string, string>> {
  return new Map([
    ...readWorkingTreeFingerprints(root),
    ...(await fingerprintManagedTree(root, ".ccr")),
  ]);
}

async function validateAutomaticUpdate(
  root: string,
  commit: string,
  journalPath: string,
): Promise<void> {
  const journal = await readBoundedTextIfExists(
    await assertSafeManagedPath(root, journalPath),
    64_000,
  );
  if (
    journal === undefined ||
    journal.isTruncated ||
    journal.content.includes("Needs concise completion.") ||
    !journal.content.includes(`- **Commit**: \`${commit}\``)
  ) {
    throw new Error("Automatic context update did not complete its journal.");
  }
  const validation = await validateContext(root);
  if (!validation.isValid) throw new Error("Automatic context update left context invalid.");
}

async function readCompletedCommits(root: string): Promise<string[]> {
  const content = await readManagedTextIfExists(root, STATE_PATH);
  if (content === undefined) return [];
  return stateSchema.parse(JSON.parse(content)).commits;
}

/** Runs one headless context update per commit and records completion only after Claude succeeds. */
export async function runAutomaticContextUpdate(
  root: string,
  commit: string,
  runner: ClaudeContextRunner = runHeadlessClaudeContextUpdate,
  journalPath?: string,
): Promise<{ status: "already-updated" | "in-progress" | "updated" }> {
  const validatedCommit = commitSchema.parse(commit);
  const validatedJournalPath = journalPathSchema.parse(journalPath);
  const release = await tryAcquireManagedLock(root, LOCK_PATH);
  if (release === undefined) return { status: "in-progress" };
  try {
    const completed = await readCompletedCommits(root);
    if (completed.includes(validatedCommit)) return { status: "already-updated" };
    const config = await readResolvedContextConfig(root);
    const allowedPaths = new Set([validatedJournalPath, ".ccr/project.md"]);
    if (config.instructions.updateDecisionsMd) allowedPaths.add(".ccr/decisions.md");
    const before = await readUpdateFingerprints(root);
    try {
      await runner(root, validatedJournalPath);
    } catch {
      throw new Error("Automatic context update failed.");
    }
    const unauthorized = changedUnauthorizedPath(
      before,
      await readUpdateFingerprints(root),
      allowedPaths,
    );
    if (unauthorized) {
      throw new Error(`Automatic context update changed an unauthorized path: ${unauthorized}.`);
    }
    await validateAutomaticUpdate(root, validatedCommit, validatedJournalPath);
    await writeManagedText(
      root,
      STATE_PATH,
      `${JSON.stringify({ schemaVersion: 1, commits: [...completed, validatedCommit].slice(-100) }, null, 2)}\n`,
    );
    return { status: "updated" };
  } finally {
    await release();
  }
}
