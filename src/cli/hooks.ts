import type { Command } from "commander";
import { runAfterCommitCheck } from "../context/after-commit";
import { findRepositoryRoot, readStagedContextState } from "../context/git";
import {
  hasSkillManagedHookState,
  readContextHookStatus,
  removeAllContextHooks,
} from "../context/hooks";
import { readResolvedContextConfig } from "../context/privacy";
import type { CliIo } from "./index";

function rootFor(io: CliIo): string {
  return findRepositoryRoot(io.cwd);
}

async function isHooksEnabled(root: string): Promise<boolean> {
  try {
    return (await readResolvedContextConfig(root)).hooks.enabled;
  } catch {
    return false;
  }
}

/** Registers advisory Git hook commands, including the post-commit context-and-journal check. */
export function registerHooksCommands(program: Command, io: CliIo): void {
  const hooks = program.command("hooks").description("Manage the advisory context Git hooks");
  hooks.command("status").action(async () => {
    const root = rootFor(io);
    if (hasSkillManagedHookState(root)) {
      io.write(
        "CCR hooks are provenance-managed by `/ccr-hooks`; run `/ccr-hooks status` for strategy and drift.\n",
      );
      return;
    }
    const preCommit = await readContextHookStatus(root, "pre-commit");
    const postCommit = await readContextHookStatus(root, "post-commit");
    io.write(
      `CCR hooks: pre-commit ${preCommit.status}, post-commit ${postCommit.status} (${preCommit.path})\n`,
    );
  });
  hooks
    .command("uninstall")
    .option("--apply", "remove CCR's marked hook blocks")
    .action(async (options: { apply?: boolean }) => {
      const root = rootFor(io);
      if (hasSkillManagedHookState(root)) {
        io.write(
          "CCR hooks are provenance-managed. Run `/ccr-hooks remove` before using CLI legacy cleanup.\n",
        );
        return;
      }
      if (!options.apply) {
        const preCommit = await readContextHookStatus(root, "pre-commit");
        const postCommit = await readContextHookStatus(root, "post-commit");
        io.write(
          `CCR hook uninstall preview: pre-commit ${preCommit.status}, post-commit ${postCommit.status}.\n`,
        );
        io.write("Run `ccr hooks uninstall --apply` to remove both advisory hooks.\n");
        return;
      }
      const result = await removeAllContextHooks(root);
      io.write(
        `CCR hooks removed: pre-commit ${result.preCommit.status}, post-commit ${result.postCommit.status}.\n`,
      );
    });
  hooks.command("after-commit").action(async () => {
    const root = rootFor(io);
    if (!(await isHooksEnabled(root))) return;
    const result = await runAfterCommitCheck(root);
    if (result.journalCreated && result.journalPath) {
      io.write(`CCR: started local journal entry ${result.journalPath}.\n`);
    }
    if (result.shouldWarn) {
      io.write(
        "CCR: last commit changed repository files without updating shared context (.ccr/).\n",
      );
    }
    if (result.prompt) {
      io.write("Paste this into Claude Code to update context and journal:\n");
      io.write(`  ${result.prompt}\n`);
    }
  });
  hooks.command("check").action(async () => {
    const root = rootFor(io);
    if (!(await isHooksEnabled(root))) return;
    let shouldCheck = false;
    try {
      shouldCheck = (await readResolvedContextConfig(root)).hooks.checkBeforeCommit;
    } catch {
      return;
    }
    if (!shouldCheck) return;
    const state = readStagedContextState(root);
    if (state.shouldWarn) {
      const warning = [
        "CCR warning: context might need updating.",
        "Run `/ccr-context update` in Claude Code, or continue if context is unaffected.",
      ].join("\n");
      io.write(`${warning}\n`);
    }
  });
}
