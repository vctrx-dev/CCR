import { execSync } from "node:child_process";

/** Runs a quality-gate command and preserves its nonzero exit as a thrown failure. */
export function runCommand(command, cwd) {
  return execSync(command, { cwd, encoding: "utf-8" }).trim();
}
