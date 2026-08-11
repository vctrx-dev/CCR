import { readFile } from "node:fs/promises";
import type { Command } from "commander";
import {
  listSafeRecentPaths,
  listSafeRepositoryPaths,
  readSafeRepositoryDiff,
  readSafeRepositoryFile,
} from "../context/broker";
import {
  DEFAULT_CONTEXT_CONFIG,
  parseContextConfig,
  serializeContextConfig,
  toPublicContextConfig,
  updateContextConfig,
} from "../context/config";
import { assertSafeManagedPath, writeManagedText } from "../context/files";
import { findRepositoryRoot, isGitIgnored, readStagedContextState } from "../context/git";
import {
  installAllContextHooks,
  readContextHookStatus,
  removeAllContextHooks,
} from "../context/hooks";
import { createJournalEntry, readRecentJournalEntries } from "../context/journal";
import { readSafeStagedPaths } from "../context/privacy";
import { applyConfigSetup, applySetup, previewSetup } from "../context/setup";
import type { SetupAction } from "../context/setup";
import { applyUninstall, previewUninstall } from "../context/uninstall";
import { validateContext } from "../context/validate";
import type { CliIo } from "./index";
import { formatSuccess } from "./output";

interface SetupOptions {
  apply?: boolean;
  dryRun?: boolean;
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

function configActionLabel(action: SetupAction): string {
  switch (action) {
    case "create":
      return "created";
    case "modify":
      return "updated";
    case "preserve":
      return "preserved";
    case "unchanged":
      return "already current";
    default: {
      const exhaustiveAction: never = action;
      return exhaustiveAction;
    }
  }
}

async function showSetup(io: CliIo, options: SetupOptions): Promise<void> {
  const root = rootFor(io);
  const preview = await previewSetup(root);
  const isSkillLocal = isGitIgnored(root, ".claude/skills/ccr/SKILL.md");
  const hookStatus = {
    preCommit: await readContextHookStatus(root, "pre-commit"),
    postCommit: await readContextHookStatus(root, "post-commit"),
  };
  const compatibility = "Requires Claude Code 2.1.0 or later; setup executes no Claude command.";
  if (!options.apply) {
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
      `Hooks: ${preview.config.hooks.enabled ? "enabled; setup will install or maintain advisory hooks" : "disabled; setup will remove CCR-managed hook blocks"}.`,
      `  pre-commit ${hookStatus.preCommit.status}`,
      `  post-commit ${hookStatus.postCommit.status}`,
      "Local-only ignore rules: config.local.json, journal/, private/, cache/, and tmp/.",
      "Data boundary: setup sends nothing; later repository reads use the filtered Git-index broker.",
      `Context settings: recent journals ${preview.config.context.recentJournalEntries}, compaction cap ${preview.config.context.maxCompactionPercent}%.`,
      "Conflicts: none. Malformed managed blocks or symlinked managed paths stop setup.",
      "Rollback: `ccr uninstall --apply` (add `--remove-context` to remove shared context).",
      "Run `ccr setup --apply` to create these files.",
    ]);
    return;
  }
  const result = await applySetup(root);
  let hookLine: string;
  if (preview.config.hooks.enabled) {
    const hookResult = await installAllContextHooks(root);
    hookLine = `CCR hooks enabled: pre-commit ${hookResult.preCommit.status}, post-commit ${hookResult.postCommit.status}; local ignore rules ${hookResult.ignore}.`;
  } else {
    const hookResult = await removeAllContextHooks(root);
    hookLine = `CCR hooks disabled by .ccr/config.json: pre-commit ${hookResult.preCommit.status}, post-commit ${hookResult.postCommit.status}.`;
  }
  writeLines(io, [
    compatibility,
    `Claude skill: ${isSkillLocal ? "local (ignored by Git)" : "shareable"}`,
    result.changedPaths.length
      ? `CCR setup wrote ${result.changedPaths.length} file(s).`
      : "CCR setup is already current.",
    hookLine,
    "Next: open Claude Code and run `/ccr-context initialize`.",
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
      await removeAllContextHooks(root);
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

  const config = program.command("config").description("Inspect committed CCR settings");
  config.action(async () => {
    const configPath = await assertSafeManagedPath(rootFor(io), ".ccr/config.json");
    const content = await readFile(configPath, "utf8");
    io.write(`${JSON.stringify(toPublicContextConfig(parseContextConfig(content)), null, 2)}\n`);
  });
  config.command("validate").action(async () => {
    const configPath = await assertSafeManagedPath(rootFor(io), ".ccr/config.json");
    const content = await readFile(configPath, "utf8");
    parseContextConfig(content);
    writeLines(io, ["CCR configuration is valid."]);
  });
  config.command("defaults").action(() => {
    io.write(serializeContextConfig(DEFAULT_CONTEXT_CONFIG));
  });
  config
    .command("init")
    .description("Create editable settings and their manual before installing the Claude skill")
    .option("--apply", "write .ccr/config.json and .ccr/config-manual.md")
    .action(async (options: { apply?: boolean }) => {
      if (!options.apply) {
        writeLines(io, [
          "Would create or upgrade .ccr/config.json and .ccr/config-manual.md only.",
          "Preview only: no files changed.",
          "Review the proposed settings, then add `--apply` to write the file.",
        ]);
        return;
      }
      const change = await applyConfigSetup(rootFor(io));
      io.write(
        `${formatSuccess(
          `CCR configuration ${configActionLabel(change.config.action)}: .ccr/config.json`,
          io.isColorEnabled === true,
        )}\n\n`,
      );
      writeLines(io, [
        `Configuration manual ${configActionLabel(change.manual.action)}: .ccr/config-manual.md`,
        "Next steps:",
        "  1. Edit .ccr/config.json, or use `ccr config set <key> <value> --apply`.",
        "  2. Run `ccr config validate`.",
        "  3. Run `ccr setup --apply` to apply the settings during setup.",
        "Examples:",
        "  ccr config set hooks.enabled false --apply",
        "  ccr config set hooks.checkBeforeCommit false --apply",
        "  ccr config set instructions.updateClaudeMd true --apply",
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
      await writeManagedText(root, ".ccr/config.json", serializeContextConfig(updated));
      writeLines(io, [
        `Updated ${key}.`,
        ...(key === "hooks" || key.startsWith("hooks.")
          ? ["Run `ccr setup --apply` to reconcile CCR-managed hooks."]
          : []),
      ]);
    });
}
