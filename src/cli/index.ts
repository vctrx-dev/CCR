#!/usr/bin/env node

import { Command, type ParseOptions } from "commander";
import packageJson from "../../package.json";
import { registerConfigCommands } from "./config";
import { registerContextCommands } from "./context";
import { renderProductHelp } from "./help";
import { registerHooksCommands } from "./hooks";
import { formatCliError, formatTone } from "./output";

export interface CliIo {
  cwd: string;
  write(message: string): void;
  isColorEnabled?: boolean;
}

function defaultIo(): CliIo {
  return {
    cwd: process.cwd(),
    isColorEnabled: process.stdout.isTTY === true,
    write(message: string) {
      process.stdout.write(message);
    },
  };
}

function normalizeVersionArguments(argv?: readonly string[]): readonly string[] | undefined {
  // Commander accepts only one-character short flags, so normalize the requested `-version`
  // spelling and preserve the v0.7 `-V` alias before Commander validates arguments.
  const input = argv ?? process.argv;
  const normalized = input.map((argument) =>
    argument === "-version" || argument === "-V" ? "--version" : argument,
  );
  return normalized.some((argument, index) => argument !== input[index]) ? normalized : argv;
}

class CcrCommand extends Command {
  override parse(argv?: readonly string[], parseOptions?: ParseOptions): this {
    return super.parse(normalizeVersionArguments(argv), parseOptions);
  }

  override parseAsync(argv?: readonly string[], parseOptions?: ParseOptions): Promise<this> {
    return super.parseAsync(normalizeVersionArguments(argv), parseOptions);
  }
}

/** Creates the CCR CLI with injectable working directory and output for safe testing. */
export function createCli(io: CliIo = defaultIo()): Command {
  const program = new CcrCommand()
    .name("ccr")
    .description("Context-aware, stakeholder-aware code review for Claude Code")
    .version(packageJson.version, "-v, --version")
    .addHelpText("after", renderProductHelp());
  registerContextCommands(program, io);
  registerConfigCommands(program, io);
  registerHooksCommands(program, io);
  return program;
}

if (typeof require !== "undefined" && require.main === module) {
  createCli()
    .parseAsync()
    .catch((error: unknown) => {
      process.stderr.write(
        `${formatTone("CCR", "error", process.stderr.isTTY === true)}: ${formatCliError(error)}\n`,
      );
      process.exitCode = 1;
    });
}
