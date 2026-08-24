import type { Command } from "commander";
import { findRepositoryRoot, isGitIgnored, readStagedContextState } from "../context/git";
import { readHookState } from "../context/hook-state";
import {
  previewContextHookRemoval,
  readContextHookStatus,
  removeAllContextHooks,
  validateContextHookRemoval,
} from "../context/hooks";
import { applySetup, previewSetup } from "../context/setup";
import { applyUninstall, previewUninstall } from "../context/uninstall";
import { validateContext } from "../context/validate";
import { registerContextInspectionCommands } from "./context-inspection";
import type { CliIo } from "./index";
import { formatAction, formatHeading, formatStatus, formatTone } from "./output";

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
  const hookState = await readHookState(root);
  const isSkillManaged = hookState.status === "valid";
  const isProvenanceInvalid = hookState.status === "invalid";
  const hookStatus =
    isSkillManaged || isProvenanceInvalid
      ? {
          preCommit: {
            path: ".ccr/private/hooks-state.json",
            status: isSkillManaged ? "provenance-managed" : "provenance-invalid",
          },
          postCommit: {
            path: ".ccr/private/hooks-state.json",
            status: isSkillManaged ? "provenance-managed" : "provenance-invalid",
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
      formatHeading("CCR setup preview · no files written", io.isColorEnabled === true),
      compatibility,
      `Claude skill: ${formatStatus(isSkillLocal ? "local" : "shareable", io.isColorEnabled === true)}${isSkillLocal ? " (ignored by Git)" : ""}`,
      formatHeading("Planned changes", io.isColorEnabled === true),
      ...preview.changes.map(
        (change) =>
          `  ${formatAction(change.action.padEnd(9), io.isColorEnabled === true)} ${change.path}`,
      ),
      formatHeading("Hooks", io.isColorEnabled === true),
      `Hooks: ${formatStatus(preview.config.hooks.enabled ? "enabled" : "disabled", io.isColorEnabled === true)}; ${preview.config.hooks.enabled ? "/ccr-hooks sync will choose the repository-native integration" : "setup will remove CCR-managed hook blocks"}.`,
      ...(isSkillManaged
        ? [
            `  ${formatStatus("provenance-managed", io.isColorEnabled === true)}; run \`/ccr-hooks status\` for strategy and drift`,
          ]
        : isProvenanceInvalid
          ? [
              `  ${formatStatus("provenance-invalid", io.isColorEnabled === true)}; run \`/ccr-hooks status\` before changing hooks`,
            ]
          : [
              `  pre-commit ${formatStatus(hookStatus.preCommit.status, io.isColorEnabled === true)}`,
              `  post-commit ${formatStatus(hookStatus.postCommit.status, io.isColorEnabled === true)}`,
            ]),
      formatTone(
        "Local-only ignore rules: config.local.json, journal/, private/, cache/, and tmp/.",
        "muted",
        io.isColorEnabled === true,
      ),
      formatTone(
        "Data boundary: setup sends nothing; later repository reads use the filtered Git-index broker.",
        "muted",
        io.isColorEnabled === true,
      ),
      `Context settings: recent journals ${preview.config.context.recentJournalEntries}, compaction cap ${preview.config.context.maxCompactionPercent}%.`,
      formatTone(
        "Conflicts: none. Malformed managed blocks or symlinked managed paths stop setup.",
        "warning",
        io.isColorEnabled === true,
      ),
      "Rollback: `ccr uninstall --apply` (add `--remove-context` to remove shared context).",
      formatTone(
        "Run `ccr setup --apply` to create these files.",
        "success",
        io.isColorEnabled === true,
      ),
    ]);
    return;
  }
  const hasHookStatus = (status: string) =>
    hookStatus.preCommit.status === status || hookStatus.postCommit.status === status;
  if (!preview.config.hooks.enabled && isProvenanceInvalid) {
    throw new Error(
      "CCR has invalid hook provenance. No setup or hook cleanup was applied; run `/ccr-hooks status`.",
    );
  }
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
    hookLine = isProvenanceInvalid
      ? "CCR hooks are enabled, but hook provenance is invalid. Run `/ccr-hooks status`; setup changed no hooks."
      : "CCR hooks are enabled in config. Setup left hook design to `/ccr-hooks sync`, which inspects this repository before writing.";
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
    `Claude skill: ${formatStatus(isSkillLocal ? "local" : "shareable", io.isColorEnabled === true)}${isSkillLocal ? " (ignored by Git)" : ""}`,
    result.changedPaths.length
      ? formatTone(
          `CCR setup wrote ${result.changedPaths.length} file(s).`,
          "success",
          io.isColorEnabled === true,
        )
      : formatTone("CCR setup is already current.", "success", io.isColorEnabled === true),
    hookLine,
    formatTone(
      "Next: open Claude Code and run `/ccr-context initialize`; it runs `/ccr-hooks sync` when hooks are enabled.",
      "info",
      io.isColorEnabled === true,
    ),
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
      const hookState = await readHookState(root);
      if (hookState.status === "valid") {
        writeLines(io, [
          formatTone(
            "CCR hooks are provenance-managed; uninstall stopped before changing files.",
            "warning",
            io.isColorEnabled === true,
          ),
          "Run `/ccr-hooks remove` first, then rerun `ccr uninstall`.",
        ]);
        return;
      }
      if (hookState.status === "invalid") {
        writeLines(io, [
          formatTone(
            "CCR has invalid hook provenance; uninstall stopped before changing files.",
            "warning",
            io.isColorEnabled === true,
          ),
          hookState.issue,
          "Run `/ccr-hooks status` and repair provenance before uninstalling.",
        ]);
        return;
      }
      const preview = await previewUninstall(root, options.removeContext ?? false);
      if (!options.apply) {
        writeLines(io, [
          formatHeading("CCR uninstall preview · no files changed", io.isColorEnabled === true),
          formatHeading("Planned changes", io.isColorEnabled === true),
          ...preview.modifyPaths.map(
            (file) => `  ${formatAction("modify".padEnd(9), io.isColorEnabled === true)} ${file}`,
          ),
          ...preview.removePaths.map(
            (file) => `  ${formatAction("remove".padEnd(9), io.isColorEnabled === true)} ${file}`,
          ),
          formatTone(
            "Local config, journals, private files, caches, and their ignore rules are preserved.",
            "muted",
            io.isColorEnabled === true,
          ),
          formatTone(
            "Run `ccr uninstall --apply` to remove the integration.",
            "success",
            io.isColorEnabled === true,
          ),
        ]);
        return;
      }
      const shouldRemoveContext = options.removeContext ?? false;
      const hookRemovalPreview = await previewContextHookRemoval(root);
      await validateContextHookRemoval(root, hookRemovalPreview);
      await applyUninstall(root, shouldRemoveContext, preview);
      await removeAllContextHooks(root, hookRemovalPreview);
      writeLines(io, [
        formatTone(
          `CCR integration removed. Shared context ${shouldRemoveContext ? "removed." : "preserved."}`,
          "success",
          io.isColorEnabled === true,
        ),
        "Local context was preserved and remains ignored.",
      ]);
    });

  const context = program.command("context").description("Inspect CCR context");
  context.command("validate").action(async () => {
    const result = await validateContext(rootFor(io));
    writeLines(
      io,
      result.isValid
        ? [formatTone("✔ CCR context is valid.", "success", io.isColorEnabled === true)]
        : [
            formatTone("✖ CCR context is invalid:", "error", io.isColorEnabled === true),
            ...result.issues,
          ],
    );
    if (!result.isValid) process.exitCode = 1;
  });
  context.command("status").action(async () => {
    const root = rootFor(io);
    const validation = await validateContext(root);
    const staged = readStagedContextState(root);
    writeLines(io, [
      formatHeading("CCR context status", io.isColorEnabled === true),
      `Context: ${formatStatus(validation.isValid ? "valid" : "invalid", io.isColorEnabled === true)}`,
      `Staged repository files: ${formatStatus(staged.hasRepositoryChanges ? "yes" : "no", io.isColorEnabled === true)}`,
      `Staged shared context: ${formatStatus(staged.hasContextChanges ? "yes" : "no", io.isColorEnabled === true)}`,
      staged.shouldWarn
        ? formatTone("Warning: context might need updating.", "warning", io.isColorEnabled === true)
        : formatTone("No context warning.", "success", io.isColorEnabled === true),
    ]);
  });
  registerContextInspectionCommands(context, io);
}
