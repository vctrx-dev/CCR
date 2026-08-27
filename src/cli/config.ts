import type { Command } from "commander";
import {
  DEFAULT_CONTEXT_CONFIG,
  serializeContextConfig,
  setDomainIfUnspecified,
  toPublicContextConfig,
  updateContextConfig,
} from "../context/config";
import { readStoredContextConfig, updateStoredContextConfig } from "../context/config-store";
import { applyConfigSetup } from "../context/setup";
import type { SetupAction } from "../context/setup";
import type { CliIo } from "./index";
import { findCliRepositoryRoot, writeCliLines } from "./io";
import { formatHeading, formatStatus, formatSuccess, formatTone } from "./output";

interface ApplyOptions {
  apply?: boolean;
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
  const rootFor = (): string => findCliRepositoryRoot(io);
  const config = program.command("config").description("Inspect committed CCR settings");
  config.action(async () => {
    io.write(
      `${JSON.stringify(toPublicContextConfig(await readStoredContextConfig(rootFor())), null, 2)}\n`,
    );
  });
  config.command("validate").action(async () => {
    await readStoredContextConfig(rootFor());
    writeCliLines(io, ["CCR configuration is valid."]);
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
        writeCliLines(io, [
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
      writeCliLines(io, [
        `Configuration manual ${configActionLabel(change.manual.action)}: .ccr/config-manual.md`,
        formatHeading("Next steps", io.isColorEnabled === true),
        "  1. Edit .ccr/config.json, or use `ccr config set <key> <value> --apply`.",
        "  2. Run `ccr config validate`.",
        "  3. Run `ccr setup --apply` to apply the settings during setup.",
        "Examples:",
        "  ccr config set hooks.enabled false --apply",
        "  ccr config set hooks.checkBeforeCommit false --apply",
        "  ccr config set hooks.autoUpdateContext true --apply",
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
      if (!options.apply) {
        updateContextConfig(await readStoredContextConfig(root), key, value);
        writeCliLines(io, [
          formatHeading("CCR configuration change · preview", io.isColorEnabled === true),
          `Would set ${key} to ${value}.`,
          "Run the same command with `--apply` to write it.",
        ]);
        return;
      }
      const { config: updated } = await updateStoredContextConfig(root, (current) =>
        updateContextConfig(current, key, value),
      );
      writeCliLines(io, [
        `Updated ${key}.`,
        ...(key === "hooks.checkBeforeCommit"
          ? ["This advisory pre-commit setting takes effect immediately; no setup is needed."]
          : []),
        ...(key === "hooks.autoUpdateContext"
          ? [
              updated.hooks.autoUpdateContext
                ? "Enabled headless post-commit context updates. Claude Code must be installed and authenticated."
                : "Disabled headless post-commit context updates; hooks remain advisory.",
            ]
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
  config
    .command("set-domain-if-unspecified")
    .description(
      "Set the initial context domain only while its generated default remains unchanged",
    )
    .argument("<domain>")
    .option("--apply", "write the evidence-derived domain when the default is still present")
    .action(async (domain: string, options: ApplyOptions) => {
      const root = rootFor();
      if (!options.apply) {
        const current = await readStoredContextConfig(root);
        const updated = setDomainIfUnspecified(current, domain);
        if (updated === current) {
          writeCliLines(io, ["Domain is already set; no files changed."]);
          return;
        }
        writeCliLines(io, [
          formatHeading("CCR initial domain · preview", io.isColorEnabled === true),
          `Would set the untouched domain default to ${updated.domain}.`,
          "Run the same command with `--apply` to write it.",
        ]);
        return;
      }
      const result = await updateStoredContextConfig(root, (current) =>
        setDomainIfUnspecified(current, domain),
      );
      writeCliLines(io, [
        result.isChanged
          ? `Set initial repository domain to ${result.config.domain}.`
          : "Domain is already set; no files changed.",
      ]);
    });
}
