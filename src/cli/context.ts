import type { Command } from "commander";
import { findRepositoryRoot, readStagedContextState } from "../context/git";
import { readHookState } from "../context/hook-state";
import {
  previewContextHookRemoval,
  removeAllContextHooks,
  validateContextHookRemoval,
} from "../context/hooks";
import { applyUninstall, previewUninstall } from "../context/uninstall";
import { validateContext } from "../context/validate";
import { registerContextInspectionCommands } from "./context-inspection";
import type { CliIo } from "./index";
import { formatAction, formatHeading, formatStatus, formatTone } from "./output";
import { registerSetupCommands } from "./setup";

function rootFor(io: CliIo): string {
  return findRepositoryRoot(io.cwd);
}

function writeLines(io: CliIo, lines: string[]): void {
  io.write(`${lines.join("\n")}\n`);
}

/** Registers context inspection and uninstall commands; setup and upgrade commands live separately. */
export function registerContextCommands(program: Command, io: CliIo): void {
  registerSetupCommands(program, io);

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

  const context = program
    .command("context")
    .description("Inspect CCR context and manage opt-in decisions");
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
