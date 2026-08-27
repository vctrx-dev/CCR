import type { Command } from "commander";
import { isGitIgnored } from "../context/git";
import { readHookState } from "../context/hook-state";
import {
  previewContextHookRemoval,
  readContextHookStatus,
  removeAllContextHooks,
  validateContextHookRemoval,
} from "../context/hooks";
import { applySetup, previewSetup } from "../context/setup";
import type { CliIo } from "./index";
import { findCliRepositoryRoot, writeCliLines } from "./io";
import { formatAction, formatHeading, formatStatus, formatTone } from "./output";

interface SetupOptions {
  apply?: boolean;
  dryRun?: boolean;
  json?: boolean;
}

type SetupOperation = "setup" | "update";

async function showSetup(
  io: CliIo,
  options: SetupOptions,
  operation: SetupOperation = "setup",
): Promise<void> {
  const root = findCliRepositoryRoot(io);
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
  const actionLabel = operation === "update" ? "CCR update" : "CCR setup";
  const nextCommand = operation === "update" ? "ccr update --apply" : "ccr setup --apply";
  const compatibility =
    "Requires Claude Code 2.1.0 or later; this operation executes no Claude command.";
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
    writeCliLines(io, [
      formatHeading(`${actionLabel} preview · no files written`, io.isColorEnabled === true),
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
      formatTone(
        "Upgrade safety: config, shared context, journals, private state, and user-owned skills are preserved; only package-managed skills, resources, and marked blocks may change.",
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
        `Run \`${nextCommand}\` to apply these changes.`,
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
      : hasHookStatus("stale")
        ? "CCR hooks have legacy marker blocks. Run `ccr hooks uninstall --apply`, then `/ccr-hooks sync` to install fresh provenance-managed hooks."
        : `CCR hooks are enabled in config. ${operation === "update" ? "Update" : "Setup"} left hook design to \`/ccr-hooks sync\`, which inspects this repository before writing.`;
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
  writeCliLines(io, [
    compatibility,
    `Claude skill: ${formatStatus(isSkillLocal ? "local" : "shareable", io.isColorEnabled === true)}${isSkillLocal ? " (ignored by Git)" : ""}`,
    result.changedPaths.length
      ? formatTone(
          `${actionLabel} wrote ${result.changedPaths.length} file(s).`,
          "success",
          io.isColorEnabled === true,
        )
      : formatTone(`${actionLabel} is already current.`, "success", io.isColorEnabled === true),
    hookLine,
    formatTone(
      operation === "update"
        ? "Next: run `ccr context validate`; use `/ccr-hooks sync` only when hook integration needs repair."
        : "Next: open Claude Code and run `/ccr-context initialize`; it runs `/ccr-hooks sync` when hooks are enabled.",
      "info",
      io.isColorEnabled === true,
    ),
  ]);
}

/** Registers preview-first setup and package-upgrade commands using the managed-artifact lifecycle. */
export function registerSetupCommands(program: Command, io: CliIo): void {
  program
    .command("setup")
    .description("Preview or apply the minimal Claude Code context setup")
    .option("--apply", "write the previewed files")
    .option("--dry-run", "preview only (the default)")
    .option("--json", "print a machine-readable preview")
    .action((options: SetupOptions) => showSetup(io, options));

  program
    .command("update")
    .description("Preview or apply safe CCR upgrades after a package update")
    .option("--apply", "write the previewed package-managed upgrades")
    .option("--dry-run", "preview only (the default)")
    .option("--json", "print a machine-readable preview")
    .action((options: SetupOptions) => showSetup(io, options, "update"));
}
