import { DEFAULT_CONTEXT_CONFIG, parseContextConfig } from "./config";
import type { ContextConfig } from "./config";
import { readManagedTextIfExists, writeManagedText } from "./files";
import { MANAGED_ARTIFACTS, isPackageManagedSkill } from "./managed-artifacts";
import { upsertManagedBlock } from "./managed-block";
import { CLAUDE_BLOCK, CONTEXT_FILES, IGNORE_BLOCK } from "./templates";

/**
 * Setup orchestration for the managed-artifact registry. New generated artifacts belong in that
 * registry, not in this workflow, so their lifecycle is handled consistently.
 */

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

function managedBlock(content: string) {
  return {
    content,
    end: content.slice(content.lastIndexOf("\n") + 1),
    start: content.slice(0, content.indexOf("\n")),
  };
}

/** Returns every proposed setup change without writing to the target repository. */
export async function previewSetup(root: string): Promise<SetupPreview> {
  const configText = await readManagedTextIfExists(root, ".ccr/config.json");
  const config = configText ? parseContextConfig(configText) : DEFAULT_CONTEXT_CONFIG;
  const requested: Record<string, string> = {
    ".gitignore": upsertManagedBlock(
      await readManagedTextIfExists(root, ".gitignore"),
      managedBlock(IGNORE_BLOCK),
      ".gitignore",
    ),
  };
  if (config.instructions.updateClaudeMd) {
    requested["CLAUDE.md"] = upsertManagedBlock(
      await readManagedTextIfExists(root, "CLAUDE.md"),
      managedBlock(CLAUDE_BLOCK),
      "CLAUDE.md",
    );
  }
  if (config.instructions.updateAgentsMd) {
    requested["AGENTS.md"] = upsertManagedBlock(
      await readManagedTextIfExists(root, "AGENTS.md"),
      managedBlock(CLAUDE_BLOCK),
      "AGENTS.md",
    );
  }
  const managedEntries = await Promise.all(
    MANAGED_ARTIFACTS.map(
      async ({ content, path: relativePath, setupPolicy }): Promise<SetupChange> => {
        const existing = await readManagedTextIfExists(root, relativePath);
        const isManagedSkill = existing !== undefined && isPackageManagedSkill(existing);
        if (
          setupPolicy === "upgrade-if-marked" &&
          existing?.includes("<!-- managed by CCR skill;") &&
          !isManagedSkill
        ) {
          throw new Error(`CCR managed file conflict in ${relativePath}.`);
        }
        return {
          path: relativePath,
          action:
            existing === undefined
              ? "create"
              : setupPolicy === "preserve-existing"
                ? "preserve"
                : existing === content
                  ? "unchanged"
                  : setupPolicy === "upgrade-if-marked" && isManagedSkill
                    ? "modify"
                    : "preserve",
          content: setupPolicy === "preserve-existing" && existing ? existing : content,
        };
      },
    ),
  );
  const changes = await Promise.all(
    Object.entries(requested).map(async ([relativePath, content]): Promise<SetupChange> => {
      const existing = await readManagedTextIfExists(root, relativePath);
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
  const existing = await readManagedTextIfExists(root, path);
  const content = `${JSON.stringify(preview.config, null, 2)}\n`;
  const action: SetupAction =
    existing === undefined ? "create" : existing === content ? "unchanged" : "modify";
  if (action !== "unchanged") await writeManagedText(root, path, content);
  return { path, action, content };
}
