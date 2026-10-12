import { lstat, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import packageJson from "../../../package.json";
import { createCli } from "../../../src/cli/index";
import { createTemporaryRootRegistry, runCommand } from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();

describe("context CLI", () => {
  it("should report the package version from the release source of truth", () => {
    expect(createCli().version()).toBe(packageJson.version);
  });

  it("should apply setup by default, preview with dry-run, and validate context", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ccr-cli-"));
    roots.push(root);
    await runCommand("git", ["init", "--quiet"], { cwd: root });
    let output = "";
    const io = {
      cwd: root,
      write: (message: string) => {
        output += message;
      },
    };

    await createCli(io).parseAsync(["node", "ccr", "setup", "--dry-run"]);
    await expect(readFile(path.join(root, ".ccr/config.json"), "utf8")).rejects.toThrow();
    expect(output).toContain("preview");
    expect(output).toContain("setup sends nothing");
    expect(output).toContain("Context settings:");
    expect(output).toContain("Rollback:");
    expect(output).toContain("executes no Claude command");

    output = "";
    await createCli(io).parseAsync(["node", "ccr", "setup"]);
    const config = JSON.parse(await readFile(path.join(root, ".ccr/config.json"), "utf8"));
    expect(config.hooks).toEqual({
      enabled: true,
      checkBeforeCommit: true,
    });
    expect(config.schemaVersion).toBeUndefined();
    expect(config.discovery).toBeUndefined();
    expect(config.privacy).toBeUndefined();
    expect(output).toContain("/ccr-hooks sync");

    output = "";
    await createCli(io).parseAsync(["node", "ccr", "context", "validate"]);
    expect(output).toContain("structural checks passed");
    expect(output).toContain("unfilled");
    expect(output).toContain("not verified");
    output = "";
    await createCli(io).parseAsync(["node", "ccr", "context", "status"]);
    expect(output).toContain("Readiness: unfilled");

    await writeFile(path.join(root, "source.txt"), "changed\n", "utf8");
    await runCommand("git", ["add", "--", "source.txt"], { cwd: root });
    await createCli(io).parseAsync([
      "node",
      "ccr",
      "config",
      "set",
      "hooks.checkBeforeCommit",
      "false",
      "--apply",
    ]);
    expect(output).toContain("background context updates are off");
    expect(output).not.toContain("reconcile CCR-managed hooks");
    output = "";
    await createCli(io).parseAsync(["node", "ccr", "hooks", "check"]);
    expect(output).toBe("");

    const hookPath = path.join(root, ".git/hooks/pre-commit");
    await expect(readFile(hookPath, "utf8")).rejects.toThrow();
    await createCli(io).parseAsync(["node", "ccr", "hooks", "status"]);
    expect(output).toContain("pre-commit not-installed");
    await createCli(io).parseAsync(["node", "ccr", "hooks", "uninstall"]);
    await expect(readFile(hookPath, "utf8")).rejects.toThrow();
    await createCli(io).parseAsync(["node", "ccr", "hooks", "uninstall", "--apply"]);
    await expect(readFile(hookPath, "utf8")).rejects.toThrow();

    output = "";
    await createCli(io).parseAsync(["node", "ccr", "uninstall", "--remove-context"]);
    expect(output).toContain("Shared context removed.");
  }, 30_000);

  it("should preview and delete all CCR data with plain uninstall", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ccr-cli-uninstall-default-"));
    roots.push(root);
    await runCommand("git", ["init", "--quiet"], { cwd: root });
    let output = "";
    const io = {
      cwd: root,
      write: (message: string) => {
        output += message;
      },
    };

    await createCli(io).parseAsync(["node", "ccr", "setup"]);
    const projectPath = path.join(root, ".ccr/project.md");
    const skillPath = path.join(root, ".claude/skills/ccr/SKILL.md");
    expect(await readFile(projectPath, "utf8")).toContain("# Project");
    expect(await readFile(skillPath, "utf8")).toContain("# CCR");

    output = "";
    await createCli(io).parseAsync(["node", "ccr", "uninstall", "--dry-run"]);
    expect(output).toContain("preview");
    expect(output).toContain("entire .ccr directory will be deleted");
    expect(output).toContain("Run `ccr uninstall` to remove the integration.");
    expect(await readFile(skillPath, "utf8")).toContain("# CCR");

    output = "";
    await createCli(io).parseAsync(["node", "ccr", "uninstall"]);
    expect(output).toContain("Shared context removed.");
    await expect(lstat(path.join(root, ".ccr"))).rejects.toThrow();
    await expect(readFile(skillPath, "utf8")).rejects.toThrow();
  });

  it("should preserve CCR data only when keep-context is explicit", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ccr-cli-uninstall-keep-"));
    roots.push(root);
    await runCommand("git", ["init", "--quiet"], { cwd: root });
    let output = "";
    const io = {
      cwd: root,
      write: (message: string) => {
        output += message;
      },
    };
    await createCli(io).parseAsync(["node", "ccr", "setup"]);
    output = "";
    await createCli(io).parseAsync(["node", "ccr", "uninstall", "--keep-context", "--dry-run"]);
    expect(output).toContain("Run `ccr uninstall --keep-context`");
    output = "";
    await createCli(io).parseAsync(["node", "ccr", "uninstall", "--keep-context"]);
    expect(output).toContain("Shared context preserved.");
    expect(await readFile(path.join(root, ".ccr/project.md"), "utf8")).toContain("# Project");
    await expect(lstat(path.join(root, ".claude/skills/ccr"))).resolves.toBeDefined();
    await expect(
      readFile(path.join(root, ".claude/skills/ccr/SKILL.md"), "utf8"),
    ).rejects.toThrow();
  });

  it.each(["--purge", "--remove-context"])(
    "should reject keep-context combined with %s before writes",
    async (flag) => {
      const root = await mkdtemp(path.join(tmpdir(), "ccr-cli-uninstall-conflict-"));
      roots.push(root);
      await runCommand("git", ["init", "--quiet"], { cwd: root });
      const io = { cwd: root, write: () => {} };
      await createCli(io).parseAsync(["node", "ccr", "setup"]);
      await expect(
        createCli(io).parseAsync(["node", "ccr", "uninstall", "--keep-context", flag]),
      ).rejects.toThrow(/cannot be combined/);
      expect(await readFile(path.join(root, ".ccr/project.md"), "utf8")).toContain("# Project");
    },
  );

  it("should never write setup when dry-run is combined with apply", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ccr-cli-dry-run-"));
    roots.push(root);
    await runCommand("git", ["init", "--quiet"], { cwd: root });
    let output = "";

    await createCli({
      cwd: root,
      write: (message: string) => {
        output += message;
      },
    }).parseAsync(["node", "ccr", "setup", "--apply", "--dry-run"]);

    await expect(readFile(path.join(root, ".ccr/config.json"), "utf8")).rejects.toThrow();
    expect(output).toContain("preview");
  });
});
