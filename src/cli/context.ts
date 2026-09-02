import type { Command } from "commander";
import { readStagedContextState } from "../context/git";
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
import { findCliRepositoryRoot, writeCliLines } from "./io";
import { formatAction, formatHeading, formatStatus, formatTone } from "./output";
import { registerSetupCommands } from "./setup";

/** Registers context inspection and uninstall commands; setup and upgrade commands live separately. */
export function registerContextCommands(program: Command, io: CliIo): void {
  registerSetupCommands(program, io);

  program
    .command("uninstall")
    .description("Remove CCR-managed integration while preserving context by default")
    .option("--apply", "apply removal (retained for backward compatibility; now the default)")
    .option("--dry-run", "preview removal without changing files")
    .option("--remove-context", "also delete known shared context files")
    .action(async (options: { dryRun?: boolean; removeContext?: boolean }) => {
      const root = findCliRepositoryRoot(io);
      const hookState = await readHookState(root);
      if (hookState.status === "valid") {
        writeCliLines(io, [
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
        writeCliLines(io, [
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
      if (options.dryRun) {
        writeCliLines(io, [
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
            "Run `ccr uninstall` to remove the integration.",
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
      writeCliLines(io, [
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
    .description("Inspect product-impact context and manage opt-in decisions");
  context.command("validate").action(async () => {
    const result = await validateContext(findCliRepositoryRoot(io));
    writeCliLines(
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
    const root = findCliRepositoryRoot(io);
    const validation = await validateContext(root);
    const staged = readStagedContextState(root);
    writeCliLines(io, [
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
