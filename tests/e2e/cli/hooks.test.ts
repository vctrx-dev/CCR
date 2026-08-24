import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

function captureIo(root: string): {
  io: { cwd: string; write: (m: string) => void };
  output: () => string;
  clear: () => void;
} {
  let output = "";
  return {
    io: {
      cwd: root,
      write: (message: string) => {
        output += message;
      },
    },
    output: () => output,
    clear: () => {
      output = "";
    },
  };
}

describe("hooks CLI", () => {
  it("should not block disabled setup on an external hook path", async () => {
    const parent = await mkdtemp(path.join(tmpdir(), "ccr-hooks-external-setup-"));
    roots.push(parent);
    const root = path.join(parent, "repository");
    await mkdir(root);
    await run("git", ["init", "--quiet"], { cwd: root });
    await run("git", ["config", "core.hooksPath", "../external-hooks"], { cwd: root });
    const { io, output, clear } = captureIo(root);
    await createCli(io).parseAsync(["node", "ccr", "config", "init", "--apply"]);
    await createCli(io).parseAsync([
      "node",
      "ccr",
      "config",
      "set",
      "hooks.enabled",
      "false",
      "--apply",
    ]);

    clear();
    await createCli(io).parseAsync(["node", "ccr", "setup", "--apply"]);

    expect(output()).toContain("unsafe external hook path");
    await expect(
      readFile(path.join(parent, "external-hooks/pre-commit"), "utf8"),
    ).rejects.toThrow();
  });

  it("should reject malformed legacy hooks before setup writes managed files", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ccr-hooks-malformed-setup-"));
    roots.push(root);
    await run("git", ["init", "--quiet"], { cwd: root });
    const { io, output, clear } = captureIo(root);
    await createCli(io).parseAsync(["node", "ccr", "config", "init", "--apply"]);
    await createCli(io).parseAsync([
      "node",
      "ccr",
      "config",
      "set",
      "hooks.enabled",
      "false",
      "--apply",
    ]);
    await writeFile(
      path.join(root, ".git/hooks/pre-commit"),
      "#!/bin/sh\n# ccr:start - advisory context check\nmissing end\n",
      "utf8",
    );

    clear();
    await createCli(io).parseAsync(["node", "ccr", "hooks", "uninstall"]);
    expect(output()).toContain("malformed");
    expect(output()).not.toContain("uninstall --apply");

    await expect(createCli(io).parseAsync(["node", "ccr", "setup", "--apply"])).rejects.toThrow(
      /malformed CCR markers/i,
    );
    await expect(
      readFile(path.join(root, ".claude/skills/ccr/SKILL.md"), "utf8"),
    ).rejects.toThrow();
  });

  it("should reject malformed legacy hooks before uninstall removes managed files", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ccr-hooks-malformed-uninstall-"));
    roots.push(root);
    await run("git", ["init", "--quiet"], { cwd: root });
    const { io } = captureIo(root);
    await createCli(io).parseAsync(["node", "ccr", "setup", "--apply"]);
    const skillPath = path.join(root, ".claude/skills/ccr/SKILL.md");
    const originalSkill = await readFile(skillPath, "utf8");
    await writeFile(
      path.join(root, ".git/hooks/post-commit"),
      "#!/bin/sh\n# ccr:start - post-commit context check\nmissing end\n",
      "utf8",
    );

    await expect(createCli(io).parseAsync(["node", "ccr", "uninstall", "--apply"])).rejects.toThrow(
      /managed block conflict/i,
    );
    expect(await readFile(skillPath, "utf8")).toBe(originalSkill);
  });

  it("should reject invalid provenance before status or removal claims ownership", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ccr-hooks-provenance-"));
    roots.push(root);
    await run("git", ["init", "--quiet"], { cwd: root });
    const { io, output, clear } = captureIo(root);
    await createCli(io).parseAsync(["node", "ccr", "setup", "--apply"]);
    await mkdir(path.join(root, ".ccr/private"), { recursive: true });
    await writeFile(path.join(root, ".ccr/private/hooks-state.json"), "{}\n", "utf8");
    const hookPath = path.join(root, ".git/hooks/pre-commit");
    const existing = "#!/bin/sh\n# ccr:start - advisory context check\ncustom\n# ccr:end\n";
    await writeFile(hookPath, existing, "utf8");

    clear();
    await createCli(io).parseAsync(["node", "ccr", "setup", "--json"]);
    const setupPreview = JSON.parse(output());
    expect(setupPreview.hooks.preCommit.status).toBe("provenance-invalid");
    expect(setupPreview.hooks.postCommit.status).toBe("provenance-invalid");

    clear();
    await createCli(io).parseAsync(["node", "ccr", "hooks", "status"]);
    expect(output()).toContain("invalid hook provenance");
    expect(output()).toContain("Preserve or move");

    clear();
    await createCli(io).parseAsync(["node", "ccr", "hooks", "uninstall", "--apply"]);
    expect(output()).toContain("invalid hook provenance");
    expect(output()).not.toContain("hooks removed");
    expect(await readFile(hookPath, "utf8")).toBe(existing);

    clear();
    await createCli(io).parseAsync(["node", "ccr", "uninstall", "--apply"]);
    expect(output()).toContain("invalid hook provenance");
    expect(output()).not.toContain("CCR integration removed");
    expect(await readFile(hookPath, "utf8")).toBe(existing);
    expect(await readFile(path.join(root, ".claude/skills/ccr-hooks/SKILL.md"), "utf8")).toContain(
      "name: ccr-hooks",
    );
  });

  it("should report existing markers without state as legacy and unprovenanced", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ccr-hooks-unprovenanced-"));
    roots.push(root);
    await run("git", ["init", "--quiet"], { cwd: root });
    const { io, output } = captureIo(root);
    await createCli(io).parseAsync(["node", "ccr", "setup", "--apply"]);
    await writeFile(
      path.join(root, ".git/hooks/pre-commit"),
      "#!/bin/sh\n# ccr:start - advisory context check\nlegacy command\n# ccr:end\n",
      "utf8",
    );

    await createCli(io).parseAsync(["node", "ccr", "hooks", "status"]);

    expect(output()).toContain("legacy/unprovenanced");
    expect(output()).toContain("no original hook history is claimed");
  });

  it("should defer enabled hook installation to the repository-aware skill", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ccr-hooks-cli-"));
    roots.push(root);
    await run("git", ["init", "--quiet"], { cwd: root });
    const { io, output, clear } = captureIo(root);

    await createCli(io).parseAsync(["node", "ccr", "setup"]);
    expect(output()).toContain("Hooks: enabled");
    await expect(readFile(path.join(root, ".git/hooks/pre-commit"), "utf8")).rejects.toThrow();

    await createCli(io).parseAsync(["node", "ccr", "setup", "--apply"]);
    expect(output()).toContain("/ccr-hooks sync");
    await expect(readFile(path.join(root, ".git/hooks/pre-commit"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(root, ".git/hooks/post-commit"), "utf8")).rejects.toThrow();
    expect(await readFile(path.join(root, ".gitignore"), "utf8")).toContain(
      "# ccr:start - local context continuity",
    );

    clear();
    await createCli(io).parseAsync([
      "node",
      "ccr",
      "config",
      "set",
      "hooks.enabled",
      "false",
      "--apply",
    ]);
    expect(output()).toContain("/ccr-hooks remove");
    await createCli(io).parseAsync(["node", "ccr", "setup", "--apply"]);
    expect(output()).toContain("CCR hooks disabled by .ccr/config.json");
    await expect(readFile(path.join(root, ".git/hooks/pre-commit"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(root, ".git/hooks/post-commit"), "utf8")).rejects.toThrow();

    await run("git", ["config", "user.name", "CCR Test"], { cwd: root });
    await run("git", ["config", "user.email", "ccr@example.test"], { cwd: root });
    await writeFile(path.join(root, "app.py"), "print(1)\n", "utf8");
    await run("git", ["add", "--", "app.py"], { cwd: root });
    clear();
    await createCli(io).parseAsync(["node", "ccr", "hooks", "pre-commit"]);
    expect(output()).toBe("");
    await run("git", ["commit", "--quiet", "-m", "first"], { cwd: root });
    await createCli(io).parseAsync(["node", "ccr", "hooks", "post-commit"]);
    expect(output()).toBe("");

    await createCli(io).parseAsync(["node", "ccr", "hooks", "uninstall", "--apply"]);
    expect(output()).toContain("pre-commit not-installed");
    expect(output()).toContain("post-commit not-installed");
    await expect(readFile(path.join(root, ".git/hooks/pre-commit"), "utf8")).rejects.toThrow();
  }, 15_000);

  it("should run the post-commit check and print a copy-paste prompt", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ccr-after-cli-"));
    roots.push(root);
    await run("git", ["init", "--quiet", "-b", "main"], { cwd: root });
    await run("git", ["config", "user.name", "CCR Test"], { cwd: root });
    await run("git", ["config", "user.email", "ccr@example.test"], { cwd: root });
    const setupIo = captureIo(root).io;
    await createCli(setupIo).parseAsync(["node", "ccr", "config", "init", "--apply"]);
    await writeFile(path.join(root, "app.py"), "print(1)\n", "utf8");
    await run("git", ["add", "."], { cwd: root });
    await run("git", ["commit", "--quiet", "-m", "first"], { cwd: root });

    const { io, output } = captureIo(root);
    await createCli(io).parseAsync(["node", "ccr", "hooks", "post-commit"]);
    expect(output()).toContain("started local journal entry");
    expect(output()).toContain("Use the ccr-context skill");
    expect(output()).toContain("changing .ccr/project.md only if");
  });

  it("should retain hidden compatibility aliases for previously generated hooks", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ccr-hook-aliases-"));
    roots.push(root);
    await run("git", ["init", "--quiet", "-b", "main"], { cwd: root });
    const setupIo = captureIo(root).io;
    await createCli(setupIo).parseAsync(["node", "ccr", "config", "init", "--apply"]);
    await createCli(setupIo).parseAsync([
      "node",
      "ccr",
      "config",
      "set",
      "hooks.enabled",
      "false",
      "--apply",
    ]);

    const { io, output } = captureIo(root);
    await createCli(io).parseAsync(["node", "ccr", "hooks", "check"]);
    await createCli(io).parseAsync(["node", "ccr", "hooks", "after-commit"]);

    expect(output()).toBe("");
  });
});
