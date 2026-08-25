import { mkdtemp, readFile, writeFile } from "node:fs/promises";
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

  it("should preview, apply, and validate setup", async () => {
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
    expect(output).toContain("/ccr-hooks sync");

    output = "";
    await createCli(io).parseAsync(["node", "ccr", "context", "validate"]);
    expect(output).toContain("CCR context is valid");

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
    expect(output).toContain("takes effect immediately");
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
    await createCli(io).parseAsync(["node", "ccr", "uninstall", "--apply", "--remove-context"]);
    expect(output).toContain("Shared context removed.");
  }, 15_000);

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
