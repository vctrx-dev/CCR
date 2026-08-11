import type { Command } from "commander";
import {
  listSafeRecentPaths,
  listSafeRepositoryPaths,
  readSafeRepositoryDiff,
  readSafeRepositoryFile,
} from "../context/broker";
import { findRepositoryRoot, isGitIgnored, readStagedContextState } from "../context/git";
import {
  hasSkillManagedHookState,
  previewContextHookRemoval,
  readContextHookStatus,
  removeAllContextHooks,
  validateContextHookRemoval,
} from "../context/hooks";
import { createJournalEntry, readRecentJournalEntries } from "../context/journal";
import { readSafeStagedPaths } from "../context/privacy";
import { applySetup, previewSetup } from "../context/setup";
import { applyUninstall, previewUninstall } from "../context/uninstall";
import { validateContext } from "../context/validate";
import type { CliIo } from "./index";

interface SetupOptions {
  apply?: boolean;
  dryRun?: boolean;
  json?: boolean;
}

function rootFor(io: CliIo): string {
  return findRepositoryRoot(io.cwd);
}

function writeLines(io: CliIo, lines: string[]): void {
  io.write(`${lines.join("\n")}\n`);
}

async function showSetup(io: CliIo, options: SetupOptions): Promise<void> {
  const root = rootFor(io);
  const preview = await previewSetup(root);
  const isSkillLocal = isGitIgnored(root, ".claude/skills/ccr/SKILL.md");
  const isSkillManaged = hasSkillManagedHookState(root);
  const hookStatus = isSkillManaged
    ? {
        preCommit: {
          path: ".ccr/private/hooks-state.json",
          status: "provenance-managed" as const,
        },
        postCommit: {
          path: ".ccr/private/hooks-state.json",
          status: "provenance-managed" as const,
        },
      }
    : {
        preCommit: await readContextHookStatus(root, "pre-commit"),
        postCommit: await readContextHookStatus(root, "post-commit"),
      };
  const compatibility = "Requires Claude Code 2.1.0 or later; setup executes no Claude command.";
  if (!options.apply || options.dryRun) {
    if (options.json) {
      io.write(
        `${JSON.stringify(
          {
            root,
            writesFiles: false,
            sendsData: false,
            skillVisibility: isSkillLocal ? "local" : "shareable",
            contextSettings: preview.config.context,
            hooks: {
              enabled: preview.config.hooks.enabled,
              preCommit: hookStatus.preCommit,
              postCommit: hookStatus.postCommit,
            },
            changes: preview.changes.map(({ action, path: relativePath }) => ({
              action,
              path: relativePath,
            })),
            rollback: "ccr uninstall --apply [--remove-context]",
          },
          null,
          2,
        )}\n`,
      );
      return;
    }
    writeLines(io, [
      "CCR setup preview (no files written):",
      compatibility,
      `Claude skill: ${isSkillLocal ? "local (ignored by Git)" : "shareable"}`,
      ...preview.changes.map((change) => `  ${change.action.padEnd(9)} ${change.path}`),
      `Hooks: ${preview.config.hooks.enabled ? "enabled; /ccr-hooks sync will choose the repository-native integration" : "disabled; setup will remove CCR-managed hook blocks"}.`,
      ...(isSkillManaged
        ? ["  provenance-managed; run `/ccr-hooks status` for strategy and drift"]
        : [
            `  pre-commit ${hookStatus.preCommit.status}`,
            `  post-commit ${hookStatus.postCommit.status}`,
          ]),
      "Local-only ignore rules: config.local.json, journal/, private/, cache/, and tmp/.",
      "Data boundary: setup sends nothing; later repository reads use the filtered Git-index broker.",
      `Context settings: recent journals ${preview.config.context.recentJournalEntries}, compaction cap ${preview.config.context.maxCompactionPercent}%.`,
      "Conflicts: none. Malformed managed blocks or symlinked managed paths stop setup.",
      "Rollback: `ccr uninstall --apply` (add `--remove-context` to remove shared context).",
      "Run `ccr setup --apply` to create these files.",
    ]);
    return;
  }
  const hasHookStatus = (status: string) =>
    hookStatus.preCommit.status === status || hookStatus.postCommit.status === status;
  if (!preview.config.hooks.enabled && !isSkillManaged && hasHookStatus("malformed")) {
    throw new Error(
      "CCR hooks are disabled, but a legacy hook has malformed CCR markers. Repair the markers or run `/ccr-hooks remove` before setup.",
    );
  }
  const hookRemovalPreview =
    !preview.config.hooks.enabled &&
    !isSkillManaged &&
    !hasHookStatus("unsafe") &&
    !hasHookStatus("unavailable")
      ? await previewContextHookRemoval(root)
      : undefined;
  if (hookRemovalPreview) await validateContextHookRemoval(root, hookRemovalPreview);

  const result = await applySetup(root, preview);
  let hookLine: string;
  if (preview.config.hooks.enabled) {
    hookLine =
      "CCR hooks are enabled in config. Setup left hook design to `/ccr-hooks sync`, which inspects this repository before writing.";
  } else if (isSkillManaged) {
    hookLine =
      "CCR hooks are provenance-managed. Run `/ccr-hooks remove` before CLI legacy cleanup.";
  } else if (hasHookStatus("unsafe")) {
    hookLine =
      "CCR hooks are disabled, but Git configured an unsafe external hook path. No hook files were changed; use `/ccr-hooks remove` if CCR integration exists.";
  } else if (hasHookStatus("unavailable")) {
    hookLine =
      "CCR hooks are disabled, but Git hook metadata is unavailable. No hook files were changed; inspect the repository and use `/ccr-hooks remove` if CCR integration exists.";
  } else {
    const hookResult = await removeAllContextHooks(root, hookRemovalPreview);
    hookLine = `CCR hooks disabled by .ccr/config.json: pre-commit ${hookResult.preCommit.status}, post-commit ${hookResult.postCommit.status}.`;
  }
  writeLines(io, [
    compatibility,
    `Claude skill: ${isSkillLocal ? "local (ignored by Git)" : "shareable"}`,
    result.changedPaths.length
      ? `CCR setup wrote ${result.changedPaths.length} file(s).`
      : "CCR setup is already current.",
    hookLine,
    "Next: open Claude Code and run `/ccr-context initialize`; it runs `/ccr-hooks sync` when hooks are enabled.",
  ]);
}

/** Registers setup, context, configuration, and advisory-hook commands. */
export function registerContextCommands(program: Command, io: CliIo): void {
  program
    .command("setup")
    .description("Preview or apply the minimal Claude Code context setup")
    .option("--apply", "write the previewed files")
    .option("--dry-run", "preview only (the default)")
    .option("--json", "print a machine-readable preview")
    .action((options: SetupOptions) => showSetup(io, options));

  program
    .command("uninstall")
    .description("Preview or remove CCR-managed integration")
    .option("--apply", "apply the previewed removal")
    .option("--remove-context", "also delete known shared context files")
    .action(async (options: { apply?: boolean; removeContext?: boolean }) => {
      const root = rootFor(io);
      if (hasSkillManagedHookState(root)) {
        writeLines(io, [
          "CCR hooks are provenance-managed; uninstall stopped before changing files.",
          "Run `/ccr-hooks remove` first, then rerun `ccr uninstall`.",
        ]);
        return;
      }
      const preview = await previewUninstall(root, options.removeContext ?? false);
      if (!options.apply) {
        writeLines(io, [
          "CCR uninstall preview (no files changed):",
          ...preview.modifyPaths.map((file) => `  modify    ${file}`),
          ...preview.removePaths.map((file) => `  remove    ${file}`),
          "Local config, journals, private files, caches, and their ignore rules are preserved.",
          "Run `ccr uninstall --apply` to remove the integration.",
        ]);
        return;
      }
      const shouldRemoveContext = options.removeContext ?? false;
      const hookRemovalPreview = await previewContextHookRemoval(root);
      await validateContextHookRemoval(root, hookRemovalPreview);
      await applyUninstall(root, shouldRemoveContext, preview);
      await removeAllContextHooks(root, hookRemovalPreview);
      writeLines(io, [
        `CCR integration removed. Shared context ${shouldRemoveContext ? "removed." : "preserved."}`,
        "Local context was preserved and remains ignored.",
      ]);
    });

  const context = program.command("context").description("Inspect CCR context");
  context.command("validate").action(async () => {
    const result = await validateContext(rootFor(io));
    writeLines(
      io,
      result.isValid ? ["CCR context is valid."] : ["CCR context is invalid:", ...result.issues],
    );
    if (!result.isValid) process.exitCode = 1;
  });
  context.command("status").action(async () => {
    const root = rootFor(io);
    const validation = await validateContext(root);
    const staged = readStagedContextState(root);
    writeLines(io, [
      `Context: ${validation.isValid ? "valid" : "invalid"}`,
      `Staged repository files: ${staged.hasRepositoryChanges ? "yes" : "no"}`,
      `Staged shared context: ${staged.hasContextChanges ? "yes" : "no"}`,
      staged.shouldWarn ? "Warning: context might need updating." : "No context warning.",
    ]);
  });
  context.command("changes").action(async () => {
    const changes = await readSafeStagedPaths(rootFor(io));
    io.write(
      `${JSON.stringify({
        allowedStagedPaths: changes.included,
        excludedPathCount: changes.excluded.length,
      })}\n`,
    );
  });
  context
    .command("files [prefix]")
    .description("List safe index roots or files below a prefix")
    .action(async (prefix?: string) => {
      io.write(`${JSON.stringify(await listSafeRepositoryPaths(rootFor(io), prefix))}\n`);
    });
  context
    .command("read <file>")
    .description("Read one approved file from Git's index")
    .action(async (file: string) => {
      io.write(await readSafeRepositoryFile(rootFor(io), file));
    });
  context
    .command("diff <file>")
    .description("Read one approved staged diff")
    .action(async (file: string) => {
      io.write(await readSafeRepositoryDiff(rootFor(io), file));
    });
  context.command("recent").action(async () => {
    io.write(`${JSON.stringify(await listSafeRecentPaths(rootFor(io)))}\n`);
  });
  context.command("journal").action(async () => {
    const result = await createJournalEntry(rootFor(io));
    writeLines(io, [`Created ${result.path}`]);
  });
  context.command("journals").action(async () => {
    io.write(`${JSON.stringify(await readRecentJournalEntries(rootFor(io)))}\n`);
  });
}
