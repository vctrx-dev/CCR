#!/usr/bin/env node

import { Command } from "commander";
import { registerContextCommands } from "./context";
import { registerHooksCommands } from "./hooks";

export interface CliIo {
  cwd: string;
  write(message: string): void;
}

function defaultIo(): CliIo {
  return {
    cwd: process.cwd(),
    write(message: string) {
      process.stdout.write(message);
    },
  };
}

/** Creates the CCR CLI with injectable working directory and output for safe testing. */
export function createCli(io: CliIo = defaultIo()): Command {
  const program = new Command()
    .name("ccr")
    .description("Context management for ethical review of educational software")
    .version("0.3.0");
  registerContextCommands(program, io);
  registerHooksCommands(program, io);
  return program;
}

if (typeof require !== "undefined" && require.main === module) {
  createCli()
    .parseAsync()
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Unknown CCR error";
      process.stderr.write(`CCR: ${message}\n`);
      process.exitCode = 1;
    });
}
