import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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

describe("configuration CLI", () => {
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

  it("should preview, display, validate, and apply explicit configuration changes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ccr-config-cli-"));
    roots.push(root);
    await run("git", ["init", "--quiet"], { cwd: root });
    let output = "";
    const io = {
      cwd: root,
      write(message: string) {
        output += message;
      },
    };

    await createCli(io).parseAsync(["node", "ccr", "config", "init"]);
    expect(output).toContain("CCR configuration preview · no files changed");
    await expect(readFile(path.join(root, ".ccr/config.json"), "utf8")).rejects.toThrow();

    output = "";
    await createCli(io).parseAsync(["node", "ccr", "config", "init", "--apply"]);
    await createCli(io).parseAsync(["node", "ccr", "config", "validate"]);
    expect(output).toContain("CCR configuration is valid.");

    output = "";
    await createCli(io).parseAsync(["node", "ccr", "config"]);
    expect(JSON.parse(output)).toMatchObject({
      hooks: { checkBeforeCommit: true, enabled: true },
    });

    output = "";
    await createCli(io).parseAsync([
      "node",
      "ccr",
      "config",
      "set",
      "hooks.checkBeforeCommit",
      "false",
    ]);
    expect(output).toContain("CCR configuration change · preview");
    expect(
      JSON.parse(await readFile(path.join(root, ".ccr/config.json"), "utf8")).hooks,
    ).toMatchObject({ checkBeforeCommit: true });

    output = "";
    await createCli(io).parseAsync([
      "node",
      "ccr",
      "config",
      "set",
      "hooks.checkBeforeCommit",
      "false",
      "--apply",
    ]);
    expect(output).toContain("This advisory pre-commit setting takes effect immediately");

    output = "";
    await createCli(io).parseAsync([
      "node",
      "ccr",
      "config",
      "set",
      "hooks.enabled",
      "false",
      "--apply",
    ]);
    expect(output).toContain("Run `/ccr-hooks remove` in Claude Code");
    expect(JSON.parse(await readFile(path.join(root, ".ccr/config.json"), "utf8")).hooks).toEqual({
      enabled: false,
      checkBeforeCommit: false,
    });
  });
});
