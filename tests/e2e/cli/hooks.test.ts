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
  it("should apply the configured hook policy during setup", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ccr-hooks-cli-"));
    roots.push(root);
    await run("git", ["init", "--quiet"], { cwd: root });
    const { io, output, clear } = captureIo(root);

    await createCli(io).parseAsync(["node", "ccr", "setup"]);
    expect(output()).toContain("Hooks: enabled");
    await expect(readFile(path.join(root, ".git/hooks/pre-commit"), "utf8")).rejects.toThrow();

    await createCli(io).parseAsync(["node", "ccr", "setup", "--apply"]);
    expect(output()).toContain("CCR hooks enabled: pre-commit installed");
    expect(await readFile(path.join(root, ".git/hooks/pre-commit"), "utf8")).toContain(
      "ccr hooks check",
    );
    expect(await readFile(path.join(root, ".git/hooks/post-commit"), "utf8")).toContain(
      "ccr hooks after-commit",
    );
    expect(await readFile(path.join(root, ".gitignore"), "utf8")).toContain(
      "# ccr:start - local context continuity",
    );

    await createCli(io).parseAsync([
      "node",
      "ccr",
      "config",
      "set",
      "hooks.enabled",
      "false",
      "--apply",
    ]);
    await createCli(io).parseAsync(["node", "ccr", "setup", "--apply"]);
    expect(output()).toContain("CCR hooks disabled by .ccr/config.json");
    expect(await readFile(path.join(root, ".git/hooks/pre-commit"), "utf8")).not.toContain(
      "ccr:start",
    );
    expect(await readFile(path.join(root, ".git/hooks/post-commit"), "utf8")).not.toContain(
      "ccr:start",
    );

    await run("git", ["config", "user.name", "CCR Test"], { cwd: root });
    await run("git", ["config", "user.email", "ccr@example.test"], { cwd: root });
    await writeFile(path.join(root, "app.py"), "print(1)\n", "utf8");
    await run("git", ["add", "--", "app.py"], { cwd: root });
    clear();
    await createCli(io).parseAsync(["node", "ccr", "hooks", "check"]);
    expect(output()).toBe("");
    await run("git", ["commit", "--quiet", "-m", "first"], { cwd: root });
    await createCli(io).parseAsync(["node", "ccr", "hooks", "after-commit"]);
    expect(output()).toBe("");

    await createCli(io).parseAsync(["node", "ccr", "hooks", "uninstall", "--apply"]);
    expect(output()).toContain("pre-commit not-installed");
    expect(output()).toContain("post-commit not-installed");
    expect(await readFile(path.join(root, ".git/hooks/pre-commit"), "utf8")).not.toContain(
      "ccr:start",
    );
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
    await createCli(io).parseAsync(["node", "ccr", "hooks", "after-commit"]);
    expect(output()).toContain("started local journal entry");
    expect(output()).toContain("Use the ccr-context skill");
    expect(output()).toContain("changing .ccr/project.md only if");
  });
});
