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
      write: (message: string) => {
        output += message;
      },
    };

    await createCli(io).parseAsync(["node", "ccr", "config", "defaults"]);
    expect(output).toContain('"checkBeforeCommit": true');
    expect(output).toContain('"subagentCount": 3');
    expect(output).toContain('"_comment"');
    expect(output).toContain('"_help"');
    expect(output).not.toContain("providerPolicy");
    expect(output).not.toContain("maxIndexCharacters");
    expect(output).not.toContain("maxFileCharacters");

    await createCli(io).parseAsync(["node", "ccr", "config", "init", "--apply"]);
    expect(await readFile(path.join(root, ".ccr/config.json"), "utf8")).toBeTruthy();
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
    expect(await readFile(path.join(root, ".ccr/config.json"), "utf8")).toContain(
      '"schemaVersion": 2',
    );

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
      "automation.checkBeforeCommit",
      "false",
      "--apply",
    ]);
    output = "";
    await createCli(io).parseAsync(["node", "ccr", "hooks", "check"]);
    expect(output).toBe("");

    const hookPath = path.join(root, ".git/hooks/pre-commit");
    await createCli(io).parseAsync(["node", "ccr", "hooks", "install"]);
    await expect(readFile(hookPath, "utf8")).rejects.toThrow();
    await createCli(io).parseAsync(["node", "ccr", "hooks", "install", "--apply"]);
    expect(await readFile(hookPath, "utf8")).toContain("# ccr:start");
    await createCli(io).parseAsync(["node", "ccr", "hooks", "uninstall"]);
    expect(await readFile(hookPath, "utf8")).toContain("# ccr:start");
    await createCli(io).parseAsync(["node", "ccr", "hooks", "uninstall", "--apply"]);
    expect(await readFile(hookPath, "utf8")).not.toContain("# ccr:start");

    output = "";
    await createCli(io).parseAsync(["node", "ccr", "uninstall", "--apply", "--remove-context"]);
    expect(output).toContain("Shared context removed.");
  });
});
