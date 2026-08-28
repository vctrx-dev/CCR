import { findRepositoryRoot } from "../context/git";
import type { CliIo } from "./index";

/** Shared CLI adapter for repository resolution and consistently terminated multi-line output. */
export function findCliRepositoryRoot(io: CliIo): string {
  return findRepositoryRoot(io.cwd);
}

/** Writes a group of CLI lines as one newline-terminated operation. */
export function writeCliLines(io: CliIo, lines: string[]): void {
  io.write(`${lines.join("\n")}\n`);
}
