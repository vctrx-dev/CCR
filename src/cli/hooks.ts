import type { Command } from "commander";
import { runAfterCommitCheck } from "../context/after-commit";
import { runAutomaticContextUpdate } from "../context/automatic-context-update";
import { readStagedContextState } from "../context/git";
import { readHookState } from "../context/hook-state";
import { readContextHookStatus, removeAllContextHooks } from "../context/hooks";
import { readResolvedContextConfig } from "../context/privacy";
import { readStagedReviewFreshness } from "../review/review-state";
import type { CliIo } from "./index";
import { findCliRepositoryRoot } from "./io";
import { formatHeading, formatStatus, formatTone } from "./output";

async function readHookSettings(root: string) {
  try {
    return (await readResolvedContextConfig(root)).hooks;
  } catch (error: unknown) {
    throw new Error(
      "CCR hook settings are unavailable; validate .ccr/config.json before running hooks.",
      { cause: error },
    );
  }
}

async function runPostCommitCommand(io: CliIo): Promise<void> {
  const root = findCliRepositoryRoot(io);
  const settings = await readHookSettings(root);
  if (!settings?.enabled) return;
  const result = await runAfterCommitCheck(root);
  if (result.journalCreated && result.journalPath) {
    io.write(
      `${formatTone("CCR: started local journal entry", "success", io.isColorEnabled === true)} ${result.journalPath}.\n`,
    );
  }
  if (result.shouldWarn) {
    io.write(
      `${formatTone("CCR warning", "warning", io.isColorEnabled === true)}: last commit changed repository files without updating shared context (.ccr/).\n`,
    );
  }
  if (result.reviewStatus === "stale") {
    io.write(
      `${formatTone("CCR warning", "warning", io.isColorEnabled === true)}: the commit differs from the state recorded by its latest CCR review; that review is now marked stale.\n`,
    );
  }
  if (result.prompt) {
    const journalPath = result.journalPath;
    if (settings.autoUpdateContext && result.commit && result.hasRepositoryChanges && journalPath) {
      try {
        const automatic = await runAutomaticContextUpdate(
          root,
          result.commit,
          undefined,
          journalPath,
        );
        io.write(
          automatic.status === "updated"
            ? `${formatTone("CCR: automatic context update completed", "success", io.isColorEnabled === true)}. Review and commit any resulting shared context changes.\n`
            : automatic.status === "already-updated"
              ? `${formatTone("CCR: automatic context update already completed for this commit", "info", io.isColorEnabled === true)}.\n`
              : `${formatTone("CCR: automatic context update is already running", "info", io.isColorEnabled === true)}.\n`,
        );
      } catch {
        io.write(
          `${formatTone("CCR warning", "warning", io.isColorEnabled === true)}: automatic context update failed; run \`/ccr-context update\` manually.\n`,
        );
      }
      return;
    }
    io.write(
      `${formatTone("Paste this into Claude Code to update context and journal:", "info", io.isColorEnabled === true)}\n`,
    );
    io.write(`  ${result.prompt}\n`);
  }
}

async function runPreCommitCommand(io: CliIo): Promise<void> {
  const root = findCliRepositoryRoot(io);
  const settings = await readHookSettings(root);
  if (!settings?.enabled || !settings.checkBeforeCommit) return;
  const state = readStagedContextState(root);
  const review = await readStagedReviewFreshness(root);
  if (review.status === "stale") {
    io.write(
      `${formatTone("CCR warning: staged review evidence or shared context differs from the latest recorded CCR review.", "warning", io.isColorEnabled === true)}\nRun \`/ccr-review changes\` again before human approval, or continue knowing the prior review is stale.\n`,
    );
  }
  if (state.shouldWarn) {
    const warning = [
      "CCR warning: context might need updating.",
      "Run `/ccr-context update` in Claude Code, or continue if context is unaffected.",
    ].join("\n");
    io.write(`${formatTone(warning, "warning", io.isColorEnabled === true)}\n`);
  }
}

/** Registers advisory Git hook commands, including the post-commit context-and-journal check. */
export function registerHooksCommands(program: Command, io: CliIo): void {
  const hooks = program.command("hooks").description("Manage the advisory context Git hooks");
  hooks.command("status").action(async () => {
    const root = findCliRepositoryRoot(io);
    const hookState = await readHookState(root);
    if (hookState.status === "valid") {
      io.write(
        "CCR hooks are provenance-managed by `/ccr-hooks`; run `/ccr-hooks status` for strategy and drift.\n",
      );
      return;
    }
    if (hookState.status === "invalid") {
      io.write(
        `${formatTone("CCR has invalid hook provenance; ownership and restoration are not trusted.", "error", io.isColorEnabled === true)} ${hookState.issue}\n`,
      );
      io.write(
        "Preserve or move `.ccr/private/hooks-state.json` for investigation; after it is absent, recheck status before explicit marker-only cleanup and a fresh sync.\n",
      );
      return;
    }
    const preCommit = await readContextHookStatus(root, "pre-commit");
    const postCommit = await readContextHookStatus(root, "post-commit");
    io.write(`${formatHeading("CCR hooks", io.isColorEnabled === true)}\n`);
    io.write(
      `pre-commit ${formatStatus(preCommit.status, io.isColorEnabled === true)}\npost-commit ${formatStatus(postCommit.status, io.isColorEnabled === true)}\n`,
    );
    if (
      [preCommit.status, postCommit.status].some(
        (status) => status === "current" || status === "stale",
      )
    ) {
      io.write(
        `${formatTone("CCR markers are legacy/unprovenanced; no original hook history is claimed.", "warning", io.isColorEnabled === true)}\n`,
      );
    }
    io.write(formatTone(`Hook path: ${preCommit.path}\n`, "muted", io.isColorEnabled === true));
  });
  hooks
    .command("uninstall")
    .option(
      "--apply",
      "remove CCR's marked hook blocks (retained for compatibility; now the default)",
    )
    .option("--dry-run", "preview legacy hook cleanup without changing files")
    .action(async (options: { dryRun?: boolean }) => {
      const root = findCliRepositoryRoot(io);
      const hookState = await readHookState(root);
      if (hookState.status === "valid") {
        io.write(
          `${formatTone("CCR hooks are provenance-managed.", "warning", io.isColorEnabled === true)} Run \`/ccr-hooks remove\` before using CLI legacy cleanup.\n`,
        );
        return;
      }
      if (hookState.status === "invalid") {
        io.write(
          `${formatTone("CCR has invalid hook provenance; cleanup stopped before changing files.", "error", io.isColorEnabled === true)} ${hookState.issue}\n`,
        );
        io.write(
          "Preserve or move `.ccr/private/hooks-state.json` for investigation, then recheck status.\n",
        );
        return;
      }
      if (options.dryRun) {
        const preCommit = await readContextHookStatus(root, "pre-commit");
        const postCommit = await readContextHookStatus(root, "post-commit");
        io.write(
          `${formatHeading("CCR hook uninstall preview", io.isColorEnabled === true)}\npre-commit ${formatStatus(preCommit.status, io.isColorEnabled === true)}\npost-commit ${formatStatus(postCommit.status, io.isColorEnabled === true)}\n`,
        );
        const isCleanupBlocked = [preCommit.status, postCommit.status].some(
          (status) => status === "malformed" || status === "unsafe" || status === "unavailable",
        );
        io.write(
          isCleanupBlocked
            ? `${formatTone("Cleanup cannot be applied until the reported hook state is repaired.", "error", io.isColorEnabled === true)}\n`
            : `${formatTone("Run `ccr hooks uninstall` to remove both advisory hooks.", "success", io.isColorEnabled === true)}\n`,
        );
        return;
      }
      const result = await removeAllContextHooks(root);
      io.write(
        `${formatTone("CCR hooks removed", "success", io.isColorEnabled === true)}: pre-commit ${formatStatus(result.preCommit.status, io.isColorEnabled === true)}, post-commit ${formatStatus(result.postCommit.status, io.isColorEnabled === true)}.\n`,
      );
    });
  hooks.command("post-commit").action(() => runPostCommitCommand(io));
  hooks.command("pre-commit").action(() => runPreCommitCommand(io));
  hooks.command("after-commit", { hidden: true }).action(() => runPostCommitCommand(io));
  hooks.command("check", { hidden: true }).action(() => runPreCommitCommand(io));
}
