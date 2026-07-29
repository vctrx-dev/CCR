import { readFile } from "node:fs/promises";
import type { Command } from "commander";
import {
  listSafeRepositoryPaths,
  readSafeRepositoryDiff,
  readSafeRepositoryFile,
} from "../context/broker";
import { DEFAULT_CONTEXT_CONFIG, parseContextConfig, updateContextConfig } from "../context/config";
import { assertSafeManagedPath, writeManagedText } from "../context/files";
import { findRepositoryRoot, isGitIgnored, readStagedContextState } from "../context/git";
import { installContextHook, readContextHookStatus, removeContextHook } from "../context/hooks";
import { createJournalEntry, readRecentJournalEntries } from "../context/journal";
import { readResolvedContextConfig, readSafeStagedPaths } from "../context/privacy";
import { applyConfigSetup, applySetup, previewSetup } from "../context/setup";
import { applyUninstall, previewUninstall } from "../context/uninstall";
import { validateContext } from "../context/validate";
import type { CliIo } from "./index";

interface SetupOptions {
  apply?: boolean;
  dryRun?: boolean;
  hooks?: boolean;
  json?: boolean;
}

interface ApplyOptions {
  apply?: boolean;
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
  const compatibility = "Requires Claude Code 2.1.0 or later; setup executes no Claude command.";
  if (!options.apply) {
    const hookPreview = options.hooks ? await readContextHookStatus(root) : undefined;
    if (options.json) {
      io.write(
        `${JSON.stringify(
          {
            root,
            writesFiles: false,
            sendsData: false,
            skillVisibility: isSkillLocal ? "local" : "shareable",
            limits: preview.config.context,
            changes: preview.changes.map(({ action, path: relativePath }) => ({
              action,
              path: relativePath,
            })),
            hook: hookPreview,
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
      ...(hookPreview ? [`  hook       ${hookPreview.path}`] : []),
      "Local-only ignore rules: config.local.json, journal/, private/, cache/, and tmp/.",
      "Data boundary: setup sends nothing; later repository reads use the filtered Git-index broker.",
      `Context limits: index ${preview.config.context.maxIndexCharacters}, file ${preview.config.context.maxFileCharacters}, recent journals ${preview.config.context.recentJournalEntries}.`,
      `Hook behavior: ${options.hooks ? "marked advisory warning requested" : "not requested"}.`,
      "Conflicts: none. Malformed managed blocks or symlinked managed paths stop setup.",
      "Rollback: `ccr uninstall --apply` (add `--remove-context` to remove shared context).",
      "Run `ccr setup --apply` to create these files.",
    ]);
    return;
  }
  const result = await applySetup(root);
  if (options.hooks) await installContextHook(root);
  writeLines(io, [
    compatibility,
    `Claude skill: ${isSkillLocal ? "local (ignored by Git)" : "shareable"}`,
    result.changedPaths.length
      ? `CCR setup wrote ${result.changedPaths.length} file(s).`
      : "CCR setup is already current.",
    "Next: open Claude Code and run `/ccr initialize`.",
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
    .option("--hooks", "install the optional advisory pre-commit check")
    .action((options: SetupOptions) => showSetup(io, options));

  program
    .command("uninstall")
    .description("Preview or remove CCR-managed integration")
    .option("--apply", "apply the previewed removal")
    .option("--remove-context", "also delete known shared context files")
    .action(async (options: { apply?: boolean; removeContext?: boolean }) => {
      const root = rootFor(io);
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
      await applyUninstall(root, shouldRemoveContext);
      await removeContextHook(root);
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
  context.command("journal").action(async () => {
    const result = await createJournalEntry(rootFor(io));
    writeLines(io, [`Created ${result.path}`]);
  });
  context.command("journals").action(async () => {
    io.write(`${JSON.stringify(await readRecentJournalEntries(rootFor(io)))}\n`);
  });

  const config = program.command("config").description("Inspect committed CCR settings");
  config.action(async () => {
    const configPath = await assertSafeManagedPath(rootFor(io), ".ccr/config.json");
    const content = await readFile(configPath, "utf8");
    parseContextConfig(content);
    io.write(content);
  });
  config.command("validate").action(async () => {
    const configPath = await assertSafeManagedPath(rootFor(io), ".ccr/config.json");
    const content = await readFile(configPath, "utf8");
    parseContextConfig(content);
    writeLines(io, ["CCR configuration is valid."]);
  });
  config.command("defaults").action(() => {
    io.write(`${JSON.stringify(DEFAULT_CONTEXT_CONFIG, null, 2)}\n`);
  });
  config
    .command("init")
    .description("Create only editable settings before installing the Claude skill")
    .option("--apply", "write .ccr/config.json")
    .action(async (options: { apply?: boolean }) => {
      if (!options.apply) {
        writeLines(io, [
          "Would create .ccr/config.json only.",
          "Run `ccr config init --apply`, edit it, then run `ccr setup --apply`.",
        ]);
        return;
      }
      const change = await applyConfigSetup(rootFor(io));
      writeLines(io, [
        `CCR configuration: ${change.action}.`,
        "Edit .ccr/config.json, run `ccr config validate`, then `ccr setup --apply`.",
      ]);
    });
  config
    .command("set")
    .argument("<key>")
    .argument("<value>")
    .option("--apply", "write the previewed setting")
    .action(async (key: string, value: string, options: ApplyOptions) => {
      const root = rootFor(io);
      const configPath = await assertSafeManagedPath(root, ".ccr/config.json");
      const current = parseContextConfig(await readFile(configPath, "utf8"));
      const updated = updateContextConfig(current, key, value);
      if (!options.apply) {
        writeLines(io, [
          `Would set ${key} to ${value}.`,
          "Run the same command with `--apply` to write it.",
        ]);
        return;
      }
      await writeManagedText(root, ".ccr/config.json", `${JSON.stringify(updated, null, 2)}\n`);
      writeLines(io, [`Updated ${key}.`]);
    });

  const hooks = program.command("hooks").description("Manage the advisory pre-commit check");
  hooks
    .command("install")
    .option("--apply", "write the previewed hook block")
    .action(async (options: ApplyOptions) => {
      const root = rootFor(io);
      if (!options.apply) {
        const preview = await readContextHookStatus(root);
        writeLines(io, [
          `CCR hook preview: ${preview.status} (${preview.path})`,
          "Run `ccr hooks install --apply` to install.",
        ]);
        return;
      }
      const result = await installContextHook(root);
      writeLines(io, [`CCR hook: ${result.status} (${result.path})`]);
    });
  hooks.command("status").action(async () => {
    const result = await readContextHookStatus(rootFor(io));
    writeLines(io, [`CCR hook: ${result.status} (${result.path})`]);
  });
  hooks
    .command("uninstall")
    .option("--apply", "remove CCR's marked hook block")
    .action(async (options: ApplyOptions) => {
      const root = rootFor(io);
      if (!options.apply) {
        const preview = await readContextHookStatus(root);
        writeLines(io, [
          `CCR hook uninstall preview: ${preview.status} (${preview.path})`,
          "Run `ccr hooks uninstall --apply` to remove.",
        ]);
        return;
      }
      const result = await removeContextHook(root);
      writeLines(io, [`CCR hook: ${result.status} (${result.path})`]);
    });
  hooks.command("check").action(async () => {
    let shouldCheck = false;
    try {
      shouldCheck = (await readResolvedContextConfig(rootFor(io))).automation.checkBeforeCommit;
    } catch {
      return;
    }
    if (!shouldCheck) return;
    const state = readStagedContextState(rootFor(io));
    if (state.shouldWarn) {
      writeLines(io, [
        "CCR warning: context might need updating.",
        "Run `/ccr update` in Claude Code, or continue if context is unaffected.",
      ]);
    }
  });
}
