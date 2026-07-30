import { readFile } from "node:fs/promises";
import { DEFAULT_CONTEXT_CONFIG, parseContextConfig } from "./config";
import type { ContextConfig } from "./config";
import { assertSafeManagedPath, writeManagedText } from "./files";
import { CCR_CONTEXT_SKILL, CCR_MANUAL_SKILL } from "./skills";
import { CLAUDE_BLOCK, CONTEXT_FILES, IGNORE_BLOCK } from "./templates";

export type SetupAction = "create" | "modify" | "preserve" | "unchanged";

export interface SetupChange {
  path: string;
  action: SetupAction;
  content: string;
}

export interface SetupPreview {
  root: string;
  config: ContextConfig;
  changes: SetupChange[];
}

const MANAGED_FILES: Readonly<Record<string, string>> = {
  ...CONTEXT_FILES,
  ".claude/skills/ccr/SKILL.md": CCR_MANUAL_SKILL,
  ".claude/skills/ccr-context/SKILL.md": CCR_CONTEXT_SKILL,
};

const MANAGED_SKILL_PATHS = new Set([
  ".claude/skills/ccr/SKILL.md",
  ".claude/skills/ccr-context/SKILL.md",
]);

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

function markerCount(content: string, marker: string): number {
  return content.split(marker).length - 1;
}

function withManagedBlock(
  existing: string | undefined,
  block: string,
  relativePath: string,
): string {
  const start = block.slice(0, block.indexOf("\n"));
  const end = block.slice(block.lastIndexOf("\n") + 1);
  const startCount = existing ? markerCount(existing, start) : 0;
  const endCount = existing ? markerCount(existing, end) : 0;
  if (startCount !== endCount || startCount > 1) {
    throw new Error(`CCR managed block conflict in ${relativePath}.`);
  }
  if (startCount === 1 && existing) {
    if (existing.indexOf(start) > existing.indexOf(end)) {
      throw new Error(`CCR managed block conflict in ${relativePath}.`);
    }
    const pattern = new RegExp(
      `${start.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${end.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
    );
    return existing.replace(pattern, block);
  }
  const base = existing?.trimEnd();
  return `${base ? `${base}\n\n` : ""}${block}\n`;
}

/** Returns every proposed setup change without writing to the target repository. */
export async function previewSetup(root: string): Promise<SetupPreview> {
  const configText = await readManagedOptional(root, ".ccr/config.json");
  const config = configText ? parseContextConfig(configText) : DEFAULT_CONTEXT_CONFIG;
  const requested: Record<string, string> = {
    ".gitignore": withManagedBlock(
      await readManagedOptional(root, ".gitignore"),
      IGNORE_BLOCK,
      ".gitignore",
    ),
  };
  if (config.instructions.updateClaudeMd) {
    requested["CLAUDE.md"] = withManagedBlock(
      await readManagedOptional(root, "CLAUDE.md"),
      CLAUDE_BLOCK,
      "CLAUDE.md",
    );
  }
  if (config.instructions.updateAgentsMd) {
    requested["AGENTS.md"] = withManagedBlock(
      await readManagedOptional(root, "AGENTS.md"),
      CLAUDE_BLOCK,
      "AGENTS.md",
    );
  }
  const managedEntries = await Promise.all(
    Object.entries(MANAGED_FILES).map(async ([relativePath, content]): Promise<SetupChange> => {
      const existing = await readManagedOptional(root, relativePath);
      const isExistingConfig = relativePath === ".ccr/config.json" && existing !== undefined;
      const isManagedSkill =
        MANAGED_SKILL_PATHS.has(relativePath) &&
        existing?.includes("<!-- managed by CCR skill;") === true;
      if (isManagedSkill && existing && markerCount(existing, "<!-- managed by CCR skill;") !== 1) {
        throw new Error(`CCR managed file conflict in ${relativePath}.`);
      }
      return {
        path: relativePath,
        action:
          existing === undefined
            ? "create"
            : isExistingConfig
              ? "preserve"
              : existing === content
                ? "unchanged"
                : isManagedSkill
                  ? "modify"
                  : "preserve",
        content: isExistingConfig ? existing : content,
      };
    }),
  );
  const changes = await Promise.all(
    Object.entries(requested).map(async ([relativePath, content]): Promise<SetupChange> => {
      const existing = await readManagedOptional(root, relativePath);
      return {
        path: relativePath,
        action: existing === undefined ? "create" : existing === content ? "unchanged" : "modify",
        content,
      };
    }),
  );
  return { root, config, changes: [...managedEntries, ...changes] };
}

/** Applies the preview while preserving existing context and user-authored files. */
export async function applySetup(root: string): Promise<{ changedPaths: string[] }> {
  const preview = await previewSetup(root);
  const changedPaths: string[] = [];
  for (const change of preview.changes) {
    if (change.action === "unchanged" || change.action === "preserve") continue;
    await writeManagedText(root, change.path, change.content);
    changedPaths.push(change.path);
  }
  return { changedPaths };
}

/** Explicitly creates or upgrades only the human-owned team configuration. */
export async function applyConfigSetup(root: string): Promise<SetupChange> {
  const preview = await previewSetup(root);
  const path = ".ccr/config.json";
  const existing = await readManagedOptional(root, path);
  const content = `${JSON.stringify(preview.config, null, 2)}\n`;
  const action: SetupAction =
    existing === undefined ? "create" : existing === content ? "unchanged" : "modify";
  if (action !== "unchanged") await writeManagedText(root, path, content);
  return { path, action, content };
}
