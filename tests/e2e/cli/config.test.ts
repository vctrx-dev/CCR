import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createCli } from "../../../src/cli/index";
import { MANAGED_LIFECYCLE_LOCK_PATH, tryAcquireManagedLock } from "../../../src/context/files";
import {
  createTemporaryGitRepository,
  createTemporaryRootRegistry,
  runCommand,
} from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();

describe("configuration CLI", () => {
  it("should let a developer create and edit configuration before installing the skill", async () => {
    const root = await createTemporaryGitRepository(roots, "ccr-config-cli-");
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
    expect(output).toContain('"autoUpdateContext": false');
    expect(output).toContain('"updateDecisionsMd": false');
    expect(output).not.toContain('"schemaVersion"');
    expect(output).not.toContain('"discovery"');
    expect(output).not.toContain('"privacy"');
    expect(output).not.toContain('"_comment"');
    expect(output).not.toContain('"_help"');
    expect(output).not.toContain("providerPolicy");
    expect(output).not.toContain("maxIndexCharacters");
    expect(output).not.toContain("maxFileCharacters");

    await createCli(io).parseAsync(["node", "ccr", "config", "init"]);
    const configText = await readFile(path.join(root, ".ccr/config.json"), "utf8");
    const manualText = await readFile(path.join(root, ".ccr/config-manual.md"), "utf8");
    expect(JSON.parse(configText).hooks).toEqual({
      enabled: true,
      checkBeforeCommit: true,
      autoUpdateContext: false,
    });
    const manualKeys = [
      "## `domain`",
      "### `hooks.enabled`",
      "### `hooks.checkBeforeCommit`",
      "### `hooks.autoUpdateContext`",
      "### `context.recentJournalEntries`",
      "### `context.maxCompactionPercent`",
      "### `instructions.updateClaudeMd`",
      "### `instructions.updateAgentsMd`",
      "### `instructions.updateDecisionsMd`",
    ];
    expect(manualKeys.map((key) => manualText.indexOf(key))).toEqual(
      [...manualKeys]
        .map((_, index) => manualText.indexOf(manualKeys[index]))
        .sort((a, b) => a - b),
    );
    expect(output).toContain("Configuration manual created: .ccr/config-manual.md");
    expect(output).toContain("\u001b[1;32m✔ CCR configuration created: .ccr/config.json\u001b[0m");
    expect(output).toContain("ccr config set <key> <value>");
    expect(output).toContain("ccr setup` to apply the settings during setup");
    await expect(
      readFile(path.join(root, ".claude/skills/ccr/SKILL.md"), "utf8"),
    ).rejects.toThrow();
  });

  it("should preview, display, validate, and apply explicit configuration changes", async () => {
    const root = await createTemporaryGitRepository(roots, "ccr-config-cli-");
    let output = "";
    const io = {
      cwd: root,
      write(message: string) {
        output += message;
      },
    };

    await createCli(io).parseAsync(["node", "ccr", "config", "init", "--dry-run"]);
    expect(output).toContain("CCR configuration preview · no files changed");
    await expect(readFile(path.join(root, ".ccr/config.json"), "utf8")).rejects.toThrow();

    output = "";
    await createCli(io).parseAsync(["node", "ccr", "config", "init"]);
    await createCli(io).parseAsync(["node", "ccr", "config", "validate"]);
    expect(output).toContain("CCR configuration is valid.");

    output = "";
    await createCli(io).parseAsync([
      "node",
      "ccr",
      "config",
      "set-domain-if-unspecified",
      "education-technology",
      "--dry-run",
    ]);
    expect(output).toContain("CCR initial domain · preview");
    expect(JSON.parse(await readFile(path.join(root, ".ccr/config.json"), "utf8")).domain).toBe(
      "unspecified",
    );

    output = "";
    await createCli(io).parseAsync([
      "node",
      "ccr",
      "config",
      "set-domain-if-unspecified",
      "education-technology",
    ]);
    expect(output).toContain("Set initial repository domain to education-technology.");

    output = "";
    await createCli(io).parseAsync([
      "node",
      "ccr",
      "config",
      "set-domain-if-unspecified",
      "civic-tech",
    ]);
    expect(output).toContain("Domain is already set; no files changed.");
    expect(JSON.parse(await readFile(path.join(root, ".ccr/config.json"), "utf8")).domain).toBe(
      "education-technology",
    );

    output = "";
    await createCli(io).parseAsync(["node", "ccr", "config"]);
    expect(JSON.parse(output)).toMatchObject({
      hooks: { checkBeforeCommit: true, enabled: true, autoUpdateContext: false },
    });

    output = "";
    await createCli(io).parseAsync([
      "node",
      "ccr",
      "config",
      "set",
      "hooks.checkBeforeCommit",
      "false",
      "--dry-run",
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
    ]);
    expect(output).toContain("This advisory pre-commit setting takes effect immediately");

    output = "";
    await createCli(io).parseAsync(["node", "ccr", "config", "set", "hooks.enabled", "false"]);
    expect(output).toContain("Run `/ccr-hooks remove` in Claude Code");
    expect(JSON.parse(await readFile(path.join(root, ".ccr/config.json"), "utf8")).hooks).toEqual({
      enabled: false,
      checkBeforeCommit: false,
      autoUpdateContext: false,
    });
  });

  it("should preserve the first conditional domain when initializers race", async () => {
    const root = await createTemporaryGitRepository(roots, "ccr-config-domain-race-");
    const outputs = ["", ""];
    const ios = outputs.map((_, index) => ({
      cwd: root,
      write(message: string) {
        outputs[index] += message;
      },
    }));
    const firstIo = ios[0];
    const secondIo = ios[1];
    if (firstIo === undefined || secondIo === undefined) {
      throw new Error("Expected two isolated CLI outputs.");
    }
    await createCli(firstIo).parseAsync(["node", "ccr", "config", "init"]);
    outputs[0] = "";
    outputs[1] = "";

    await Promise.all([
      createCli(firstIo).parseAsync([
        "node",
        "ccr",
        "config",
        "set-domain-if-unspecified",
        "education-technology",
      ]),
      createCli(secondIo).parseAsync([
        "node",
        "ccr",
        "config",
        "set-domain-if-unspecified",
        "civic-tech",
      ]),
    ]);

    expect(
      outputs.filter((output) => output.includes("Set initial repository domain")),
    ).toHaveLength(1);
    expect(outputs.filter((output) => output.includes("Domain is already set"))).toHaveLength(1);
    expect(["education-technology", "civic-tech"]).toContain(
      JSON.parse(await readFile(path.join(root, ".ccr/config.json"), "utf8")).domain,
    );
  });

  it("should preserve concurrent updates to different configuration keys", async () => {
    const root = await createTemporaryGitRepository(roots, "ccr-config-update-race-");
    const io = { cwd: root, write() {} };
    await createCli(io).parseAsync(["node", "ccr", "config", "init"]);

    await Promise.all([
      createCli(io).parseAsync([
        "node",
        "ccr",
        "config",
        "set",
        "hooks.checkBeforeCommit",
        "false",
      ]),
      createCli(io).parseAsync([
        "node",
        "ccr",
        "config",
        "set",
        "instructions.updateAgentsMd",
        "true",
      ]),
    ]);

    expect(JSON.parse(await readFile(path.join(root, ".ccr/config.json"), "utf8"))).toMatchObject({
      hooks: { checkBeforeCommit: false },
      instructions: { updateAgentsMd: true },
    });
  });

  it("should not change configuration during another managed lifecycle operation", async () => {
    const root = await createTemporaryGitRepository(roots, "ccr-config-lifecycle-lock-");
    const io = { cwd: root, write() {} };
    await createCli(io).parseAsync(["node", "ccr", "config", "init"]);
    const release = await tryAcquireManagedLock(root, MANAGED_LIFECYCLE_LOCK_PATH);
    if (release === undefined) throw new Error("Expected the lifecycle lock.");

    try {
      await expect(
        createCli(io).parseAsync([
          "node",
          "ccr",
          "config",
          "set",
          "instructions.updateDecisionsMd",
          "true",
        ]),
      ).rejects.toThrow(/managed lifecycle is busy/i);
    } finally {
      await release();
    }
    expect(
      JSON.parse(await readFile(path.join(root, ".ccr/config.json"), "utf8")).instructions
        .updateDecisionsMd,
    ).toBe(false);
  });
});
