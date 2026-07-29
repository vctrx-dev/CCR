import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { assertSafeManagedPath, writeManagedText } from "./files";
import { readResolvedContextConfig } from "./privacy";

export interface JournalResult {
  path: string;
}

export interface JournalEntry extends JournalResult {
  content: string;
}

function gitValue(root: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  }).trim();
}

function branchDetails(root: string): { branch: string; directory: string } {
  const branch = gitValue(root, ["branch", "--show-current"]) || "detached";
  const branchHash = createHash("sha256").update(branch).digest("hex").slice(0, 8);
  return {
    branch,
    directory: `${branch.replace(/[^A-Za-z0-9._-]/g, "_")}-${branchHash}`,
  };
}

/** Creates a journal skeleton whose timestamp, branch, commit, and path come from deterministic inputs. */
export async function createJournalEntry(
  root: string,
  now: Date = new Date(),
): Promise<JournalResult> {
  const isoTimestamp = now.toISOString().replace(/\.\d{3}Z$/, "Z");
  const timestamp = isoTimestamp.replaceAll(":", "-");
  const { branch, directory } = branchDetails(root);
  const commit = gitValue(root, ["rev-parse", "HEAD"]);
  const relativePath = `.ccr/journal/${directory}/${timestamp}.md`;
  await writeManagedText(
    root,
    relativePath,
    `# CCR Continuity\n\n- **Timestamp**: ${isoTimestamp}\n- **Branch**: \`${branch}\`\n- **Commit**: \`${commit}\`\n\n## Changed paths\n\n- None recorded.\n\n## Summary\n\nNeeds concise completion.\n\n## Findings and decisions\n\n- Addressed: none.\n- Deferred: none.\n- Questioned: none.\n- Rejected: none.\n- Approved decisions: none.\n`,
  );
  return { path: relativePath };
}

/** Reads only the configured number of newest entries for the exact current branch. */
export async function readRecentJournalEntries(root: string): Promise<JournalEntry[]> {
  const config = await readResolvedContextConfig(root);
  const { branch, directory } = branchDetails(root);
  const relativeDirectory = `.ccr/journal/${directory}`;
  const directoryPath = await assertSafeManagedPath(root, relativeDirectory);
  let names: string[];
  try {
    names = (await readdir(directoryPath, { withFileTypes: true }))
      .filter(
        (entry) => entry.isFile() && /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.md$/u.test(entry.name),
      )
      .map((entry) => entry.name)
      .sort()
      .reverse()
      .slice(0, config.context.recentJournalEntries);
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
  return Promise.all(
    names.map(async (name) => {
      const relativePath = `${relativeDirectory}/${name}`;
      const content = await readFile(await assertSafeManagedPath(root, relativePath), "utf8");
      if (!content.includes(`- **Branch**: \`${branch}\``)) {
        throw new Error(`Journal branch metadata mismatch: ${relativePath}`);
      }
      return { path: relativePath, content };
    }),
  );
}
