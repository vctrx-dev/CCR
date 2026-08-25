import { describe, expect, it } from "vitest";
import { createCli } from "../../../src/cli/index";
import { REVIEW_DIMENSIONS } from "../../../src/review/dimensions";

describe("CLI help", () => {
  it("should explain terminal commands and current Claude Code skills", async () => {
    let output = "";
    const cli = createCli()
      .configureOutput({
        writeOut(message) {
          output += message;
        },
      })
      .exitOverride();

    await expect(cli.parseAsync(["node", "ccr", "--help"])).rejects.toMatchObject({
      code: "commander.helpDisplayed",
    });

    expect(output).toContain("Terminal commands:");
    expect(output).toContain("ccr setup [--apply] [--dry-run] [--json]");
    expect(output).toContain("ccr update [--apply] [--dry-run] [--json]");
    expect(output).toContain("ccr uninstall [--apply] [--remove-context]");
    expect(output).toContain("ccr context <command>");
    expect(output).toContain("ccr context append-decision <decision>");
    expect(output).toContain("ccr context journals [PR-<number>]");
    expect(output).toContain("ccr context review-pr PR-<number>");
    expect(output).toContain("ccr context review-pr-head PR-<number> <files...>");
    expect(output).toContain("ccr config set <key> <value> [--apply]");
    expect(output).toContain("ccr hooks <status|uninstall|pre-commit|post-commit>");
    expect(output).toContain("Claude Code skills (run inside Claude Code after setup):");
    expect(output).toContain("/ccr-context <initialize|update|verify|addition|compact>");
    expect(output).toContain("/ccr-hooks <sync|status|remove>");
    expect(output).toContain("/ccr-review [changes|codebase|PR-<number>]");
    expect(output).toContain("[all|dimension,...]");
    expect(output).not.toContain("/ccr-codebase");
    expect(output).toContain(
      `Configured dimension IDs: ${REVIEW_DIMENSIONS.dimensions.map(({ id }) => id).join(", ")}`,
    );
    expect(output).toContain("npx --no-install ccr help <command>");
  });
});
