import { readFile } from "node:fs/promises";
import type { Command } from "commander";
import {
  DEFAULT_CONTEXT_CONFIG,
  parseContextConfig,
  serializeContextConfig,
  toPublicContextConfig,
  updateContextConfig,
} from "../context/config";
import { assertSafeManagedPath, writeManagedText } from "../context/files";
import { findRepositoryRoot } from "../context/git";
import { applyConfigSetup } from "../context/setup";
import type { SetupAction } from "../context/setup";
import type { CliIo } from "./index";
import { formatHeading, formatStatus, formatSuccess, formatTone } from "./output";

interface ApplyOptions {
  apply?: boolean;
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
    case "remove":
      return "removed";
    case "unchanged":
      return "already current";
    default: {
      const exhaustiveAction: never = action;
      return exhaustiveAction;
    }
  }
}

/** Registers the human-owned CCR configuration commands. */
export function registerConfigCommands(program: Command, io: CliIo): void {
  const rootFor = (): string => findRepositoryRoot(io.cwd);
  const config = program.command("config").description("Inspect committed CCR settings");
  config.action(async () => {
    const configPath = await assertSafeManagedPath(rootFor(), ".ccr/config.json");
    const content = await readFile(configPath, "utf8");
    io.write(`${JSON.stringify(toPublicContextConfig(parseContextConfig(content)), null, 2)}\n`);
  });
  config.command("validate").action(async () => {
    const configPath = await assertSafeManagedPath(rootFor(), ".ccr/config.json");
    parseContextConfig(await readFile(configPath, "utf8"));
    writeLines(io, ["CCR configuration is valid."]);
  });
  config.command("defaults").action(() => {
    io.write(serializeContextConfig(DEFAULT_CONTEXT_CONFIG));
  });
  config
    .command("init")
    .description("Create editable settings and their manual before installing the Claude skill")
    .option("--apply", "write .ccr/config.json and .ccr/config-manual.md")
    .action(async (options: ApplyOptions) => {
      if (!options.apply) {
        writeLines(io, [
          formatHeading("CCR configuration preview · no files changed", io.isColorEnabled === true),
          "Would create or upgrade .ccr/config.json and .ccr/config-manual.md only.",
          formatTone("Preview only: no files changed.", "muted", io.isColorEnabled === true),
          "Review the proposed settings, then add `--apply` to write the file.",
        ]);
        return;
      }
      const change = await applyConfigSetup(rootFor());
      io.write(
        `${formatSuccess(
          `CCR configuration ${configActionLabel(change.config.action)}: .ccr/config.json`,
          io.isColorEnabled === true,
        )}\n\n`,
      );
      writeLines(io, [
        `Configuration manual ${configActionLabel(change.manual.action)}: .ccr/config-manual.md`,
        formatHeading("Next steps", io.isColorEnabled === true),
        "  1. Edit .ccr/config.json, or use `ccr config set <key> <value> --apply`.",
        "  2. Run `ccr config validate`.",
        "  3. Run `ccr setup --apply` to apply the settings during setup.",
        "Examples:",
        "  ccr config set hooks.enabled false --apply",
        "  ccr config set hooks.checkBeforeCommit false --apply",
        "  ccr config set instructions.updateClaudeMd true --apply",
        "  ccr config set instructions.updateDecisionsMd true --apply",
      ]);
    });
  config
    .command("set")
    .argument("<key>")
    .argument("<value>")
    .option("--apply", "write the previewed setting")
    .action(async (key: string, value: string, options: ApplyOptions) => {
      const root = rootFor();
      const configPath = await assertSafeManagedPath(root, ".ccr/config.json");
      const updated = updateContextConfig(
        parseContextConfig(await readFile(configPath, "utf8")),
        key,
        value,
      );
      if (!options.apply) {
        writeLines(io, [
          formatHeading("CCR configuration change · preview", io.isColorEnabled === true),
          `Would set ${key} to ${value}.`,
          "Run the same command with `--apply` to write it.",
        ]);
        return;
      }
      await writeManagedText(root, ".ccr/config.json", serializeContextConfig(updated));
      writeLines(io, [
        `Updated ${key}.`,
        ...(key === "hooks.checkBeforeCommit"
          ? ["This advisory pre-commit setting takes effect immediately; no setup is needed."]
          : []),
        ...(key === "hooks.enabled"
          ? [
              updated.hooks.enabled
                ? "Run `/ccr-hooks sync` in Claude Code to apply repository-native integration."
                : "Run `/ccr-hooks remove` in Claude Code to remove repository-native integration. `ccr setup --apply` also removes legacy direct CCR blocks.",
            ]
          : []),
      ]);
    });
}
