import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommand } from "../../../scripts/run-command.mjs";

describe("quality-gate command runner", () => {
  it("should return output from a successful command", () => {
    const output = runCommand("node -e \"process.stdout.write('passed')\"", path.resolve("."));

    expect(output).toBe("passed");
  });

  it("should throw when a quality-gate command fails", () => {
    expect(() => runCommand('node -e "process.exit(7)"', path.resolve("."))).toThrow();
  });
});
