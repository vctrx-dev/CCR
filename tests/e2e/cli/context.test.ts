import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { createCli } from "../../../src/cli/index";

const run = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("context CLI", () => {
  it("should let a developer create and edit configuration before installing the skill", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ccr-config-cli-"));
    roots.push(root);
    await run("git", ["init", "--quiet"], { cwd: root });
    let output = "";
    const io = {
      cwd: root,
      isColorEnabled: true,
      write: (message: string) => {
        output += message;
      },
    };

    await createCli(io).parseAsync(["node", "ccr", "config", "defaults"]);
    expect(output).toContain('"checkBeforeCommit": true');
    expect(output).toContain('"enabled": true');
    expect(output).not.toContain('"schemaVersion"');
    expect(output).not.toContain('"discovery"');
    expect(output).not.toContain('"privacy"');
    expect(output).not.toContain('"_comment"');
    expect(output).not.toContain('"_help"');
    expect(output).not.toContain("providerPolicy");
    expect(output).not.toContain("maxIndexCharacters");
    expect(output).not.toContain("maxFileCharacters");

    await createCli(io).parseAsync(["node", "ccr", "config", "init", "--apply"]);
    const configText = await readFile(path.join(root, ".ccr/config.json"), "utf8");
    const manualText = await readFile(path.join(root, ".ccr/config-manual.md"), "utf8");
    expect(JSON.parse(configText).hooks).toEqual({ enabled: true, checkBeforeCommit: true });
    expect(manualText).toContain("# CCR configuration manual");
    expect(manualText).toContain("## `domain`");
    expect(manualText).toContain("### `hooks.enabled`");
    const manualKeys = [
      "## `domain`",
      "### `hooks.enabled`",
      "### `hooks.checkBeforeCommit`",
      "### `context.recentJournalEntries`",
      "### `context.maxCompactionPercent`",
      "### `instructions.updateClaudeMd`",
      "### `instructions.updateAgentsMd`",
    ];
    expect(manualKeys.map((key) => manualText.indexOf(key))).toEqual(
      [...manualKeys]
        .map((_, index) => manualText.indexOf(manualKeys[index]))
        .sort((a, b) => a - b),
    );
    expect(output).toContain("Configuration manual created: .ccr/config-manual.md");
    expect(output).toContain("\u001b[1;32m✔ CCR configuration created: .ccr/config.json\u001b[0m");
    expect(output).toContain("ccr config set <key> <value> --apply");
    expect(output).toContain("ccr setup --apply` to apply the settings during setup");
    await expect(
      readFile(path.join(root, ".claude/skills/ccr/SKILL.md"), "utf8"),
    ).rejects.toThrow();
  });

  it("should preview, apply, and validate setup", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ccr-cli-"));
    roots.push(root);
    await run("git", ["init", "--quiet"], { cwd: root });
    let output = "";
    const io = {
      cwd: root,
      write: (message: string) => {
        output += message;
      },
    };

    await createCli(io).parseAsync(["node", "ccr", "setup"]);
    await expect(readFile(path.join(root, ".ccr/config.json"), "utf8")).rejects.toThrow();
    expect(output).toContain("preview");
    expect(output).toContain("setup sends nothing");
    expect(output).toContain("Context settings:");
    expect(output).toContain("Rollback:");
    expect(output).toContain("executes no Claude command");

    output = "";
    await createCli(io).parseAsync(["node", "ccr", "setup", "--apply"]);
    const config = JSON.parse(await readFile(path.join(root, ".ccr/config.json"), "utf8"));
    expect(config.hooks).toEqual({ enabled: true, checkBeforeCommit: true });
    expect(config.schemaVersion).toBeUndefined();
    expect(config.discovery).toBeUndefined();
    expect(config.privacy).toBeUndefined();

    output = "";
    await createCli(io).parseAsync(["node", "ccr", "context", "validate"]);
    expect(output).toContain("CCR context is valid");

    await writeFile(path.join(root, "source.txt"), "changed\n", "utf8");
    await run("git", ["add", "--", "source.txt"], { cwd: root });
    await createCli(io).parseAsync([
      "node",
      "ccr",
      "config",
      "set",
      "hooks.checkBeforeCommit",
      "false",
      "--apply",
    ]);
    output = "";
    await createCli(io).parseAsync(["node", "ccr", "hooks", "check"]);
    expect(output).toBe("");

    const hookPath = path.join(root, ".git/hooks/pre-commit");
    expect(await readFile(hookPath, "utf8")).toContain("# ccr:start");
    await createCli(io).parseAsync(["node", "ccr", "hooks", "status"]);
    expect(output).toContain("pre-commit already-installed");
    await createCli(io).parseAsync(["node", "ccr", "hooks", "uninstall"]);
    expect(await readFile(hookPath, "utf8")).toContain("# ccr:start");
    await createCli(io).parseAsync(["node", "ccr", "hooks", "uninstall", "--apply"]);
    expect(await readFile(hookPath, "utf8")).not.toContain("# ccr:start");

    output = "";
    await createCli(io).parseAsync(["node", "ccr", "uninstall", "--apply", "--remove-context"]);
    expect(output).toContain("Shared context removed.");
  }, 15_000);
});
