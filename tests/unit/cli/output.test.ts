import { describe, expect, it } from "vitest";
import { z } from "zod";
import { formatCliError, formatSuccess } from "../../../src/cli/output";

describe("CLI output", () => {
  it("should format interactive success messages in bold green", () => {
    expect(formatSuccess("Configuration created", true)).toBe(
      "\u001b[1;32m✔ Configuration created\u001b[0m",
    );
  });

  it("should keep redirected success messages readable", () => {
    expect(formatSuccess("Configuration created")).toBe("✔ Configuration created");
  });

  it("should turn schema failures into concise setting errors", () => {
    const result = z.object({ count: z.number().int().min(1).max(10) }).safeParse({ count: 11 });
    if (result.success) throw new Error("Expected test schema to reject the value.");

    const message = formatCliError(result.error);

    expect(message).toContain("count:");
    expect(message).toContain("10");
    expect(message).not.toContain('"origin"');
    expect(message).not.toContain("[\n");
  });
});
