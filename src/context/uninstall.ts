import { access, readFile, unlink } from "node:fs/promises";
import { assertSafeManagedPath, writeManagedText } from "./files";
import { CLAUDE_SKILL, CONTEXT_FILES } from "./templates";

const LOCAL_STATE_PATHS = [
  ".ccr/config.local.json",
  ".ccr/journal",
  ".ccr/private",
  ".ccr/cache",
  ".ccr/tmp",
] as const;

export interface UninstallPreview {
  removePaths: string[];
  modifyPaths: string[];
}

async function readOptional(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

async function readManagedOptional(
  root: string,
  relativePath: string,
): Promise<string | undefined> {
  return readOptional(await assertSafeManagedPath(root, relativePath));
}

function stripBlock(content: string, start: string, end: string): string {
  const startIndex = content.indexOf(start);
  const endIndex = content.indexOf(end, startIndex);
  if (startIndex < 0 || endIndex < 0) return content;
  const before = content.slice(0, startIndex).trimEnd();
  const after = content.slice(endIndex + end.length).trimStart();
  return `${before}${before && after ? "\n\n" : ""}${after}${before || after ? "\n" : ""}`;
}

async function hasLocalState(root: string): Promise<boolean> {
  for (const relativePath of LOCAL_STATE_PATHS) {
    const target = await assertSafeManagedPath(root, relativePath);
    try {
      await access(target);
      return true;
    } catch (error: unknown) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
  }
  return false;
}

/** Previews files affected by uninstall without deleting user-edited context by default. */
export async function previewUninstall(
  root: string,
  shouldRemoveContext: boolean,
): Promise<UninstallPreview> {
  const removePaths: string[] = [];
  const skillPath = ".claude/skills/ccr/SKILL.md";
  if ((await readManagedOptional(root, skillPath)) === CLAUDE_SKILL) removePaths.push(skillPath);
  if (shouldRemoveContext) {
    for (const relativePath of Object.keys(CONTEXT_FILES)) {
      if ((await readManagedOptional(root, relativePath)) !== undefined) {
        removePaths.push(relativePath);
      }
    }
  }
  const modifyPaths: string[] = [];
  for (const instructionPath of ["CLAUDE.md", "AGENTS.md"]) {
    const content = await readManagedOptional(root, instructionPath);
    if (content?.includes("<!-- ccr:start -->")) modifyPaths.push(instructionPath);
  }
  const ignore = await readManagedOptional(root, ".gitignore");
  if (ignore?.includes("# ccr:start - local context continuity") && !(await hasLocalState(root))) {
    modifyPaths.push(".gitignore");
  }
  return { removePaths, modifyPaths };
}

/** Applies a bounded uninstall and removes only known files and marked instruction blocks. */
export async function applyUninstall(
  root: string,
  shouldRemoveContext: boolean,
): Promise<UninstallPreview> {
  const preview = await previewUninstall(root, shouldRemoveContext);
  for (const relativePath of preview.removePaths) {
    await unlink(await assertSafeManagedPath(root, relativePath));
  }
  for (const relativePath of preview.modifyPaths) {
    const target = await assertSafeManagedPath(root, relativePath);
    const content = await readFile(target, "utf8");
    const updated =
      relativePath === "CLAUDE.md" || relativePath === "AGENTS.md"
        ? stripBlock(content, "<!-- ccr:start -->", "<!-- ccr:end -->")
        : stripBlock(content, "# ccr:start - local context continuity", "# ccr:end");
    await writeManagedText(root, relativePath, updated);
  }
  return preview;
}
