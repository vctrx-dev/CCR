import type { Command } from "commander";
import { runAfterCommitCheck } from "../context/after-commit";
import { hasCurrentContextAssessment } from "../context/assessment";
import {
  launchAutomaticContextUpdate,
  recordAutomaticUpdateFailure,
  takeAutomaticUpdateFailure,
} from "../context/automatic-context-launcher";
import { runAutomaticContextUpdate } from "../context/automatic-context-update";
import { isCommitInHeadHistory } from "../context/git";
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

const MANUAL_UPDATE_HINT = "run /ccr-context update last commit in Claude Code";
const AUTO_UPDATE_RETRY_MS = 5_000;
const AUTO_UPDATE_WAIT_MS = 15 * 60_000;

/**
 * Post-commit stays quiet when a review or context update already covered the commit. Otherwise it
 * starts the background update (or prints one manual hint) and returns immediately.
 */
async function runPostCommitCommand(io: CliIo): Promise<void> {
  const root = findCliRepositoryRoot(io);
  const settings = await readHookSettings(root);
  if (!settings?.enabled) return;
  const color = io.isColorEnabled === true;
  if (await takeAutomaticUpdateFailure(root)) {
    io.write(
      `${formatTone("CCR", "warning", color)}: last background context update failed; ${MANUAL_UPDATE_HINT}.
`,
    );
  }
  const result = await runAfterCommitCheck(root);
  if (result.isSkipped || !result.hasRepositoryChanges) return;
  if (await hasCurrentContextAssessment(root, result.commit)) return;
  if (
    settings.autoUpdateContext &&
    result.journalPath !== undefined &&
    launchAutomaticContextUpdate(root, result.commit, result.journalPath)
  ) {
    io.write(`${formatTone("CCR: updating context in the background.", "muted", color)}
`);
    return;
  }
  io.write(`${formatTone("CCR", "info", color)}: ${MANUAL_UPDATE_HINT} to refresh context.
`);
}

/** Background worker started by post-commit; waits for a concurrent run instead of skipping. */
async function runBackgroundAutoUpdate(io: CliIo, commit: string, journalPath: string) {
  const root = findCliRepositoryRoot(io);
  const deadline = Date.now() + AUTO_UPDATE_WAIT_MS;
  for (;;) {
    try {
      const result = await runAutomaticContextUpdate(root, commit, undefined, journalPath);
      if (result.status !== "in-progress" || Date.now() > deadline) return;
    } catch {
      // A commit dropped by reset or rewrite needs no update and no notice.
      if (isCommitInHeadHistory(root, commit)) await recordAutomaticUpdateFailure(root, commit);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, AUTO_UPDATE_RETRY_MS));
  }
}

/** Pre-commit prints at most one short line, only when staged code changed after a recorded review. */
async function runPreCommitCommand(io: CliIo): Promise<void> {
  const root = findCliRepositoryRoot(io);
  const settings = await readHookSettings(root);
  if (!settings?.enabled || !settings.checkBeforeCommit) return;
  const review = await readStagedReviewFreshness(root);
  if (review.status === "stale") {
    io.write(
      `${formatTone("CCR", "warning", io.isColorEnabled === true)}: staged code changed after the last /ccr-review.
`,
    );
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
  hooks
    .command("auto-update <commit> <journal>", { hidden: true })
    .action((commit: string, journal: string) => runBackgroundAutoUpdate(io, commit, journal));
  hooks.command("after-commit", { hidden: true }).action(() => runPostCommitCommand(io));
  hooks.command("check", { hidden: true }).action(() => runPreCommitCommand(io));
}
