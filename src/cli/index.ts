#!/usr/bin/env node

import { Command } from "commander";
import packageJson from "../../package.json";
import { registerConfigCommands } from "./config";
import { registerContextCommands } from "./context";
import { registerHooksCommands } from "./hooks";
import { formatCliError } from "./output";

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

/** Creates the CCR CLI with injectable working directory and output for safe testing. */
export function createCli(io: CliIo = defaultIo()): Command {
  const program = new Command()
    .name("ccr")
    .description("Repository context management for code review")
    .version(packageJson.version);
  registerContextCommands(program, io);
  registerConfigCommands(program, io);
  registerHooksCommands(program, io);
  return program;
}

if (typeof require !== "undefined" && require.main === module) {
  createCli()
    .parseAsync()
    .catch((error: unknown) => {
      process.stderr.write(`CCR: ${formatCliError(error)}\n`);
      process.exitCode = 1;
    });
}
