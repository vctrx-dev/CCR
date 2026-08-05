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
  };
}

describe("hooks CLI", () => {
  it("should install and remove both advisory hooks plus local ignore rules", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ccr-hooks-cli-"));
    roots.push(root);
    await run("git", ["init", "--quiet"], { cwd: root });
    const { io, output } = captureIo(root);

    await createCli(io).parseAsync(["node", "ccr", "hooks", "install"]);
    expect(output()).toContain("preview");

    await createCli(io).parseAsync(["node", "ccr", "hooks", "install", "--apply"]);
    expect(output()).toContain("pre-commit installed");
    expect(output()).toContain("post-commit installed");
    expect(await readFile(path.join(root, ".git/hooks/pre-commit"), "utf8")).toContain(
      "ccr hooks check",
    );
    expect(await readFile(path.join(root, ".git/hooks/post-commit"), "utf8")).toContain(
      "ccr hooks after-commit",
    );
    expect(await readFile(path.join(root, ".gitignore"), "utf8")).toContain(
      "# ccr:start - local context continuity",
    );

    await createCli(io).parseAsync(["node", "ccr", "hooks", "uninstall", "--apply"]);
    expect(output()).toContain("pre-commit removed");
    expect(output()).toContain("post-commit removed");
    expect(await readFile(path.join(root, ".git/hooks/pre-commit"), "utf8")).not.toContain(
      "ccr:start",
    );
  });

  it("should run the post-commit check and print a copy-paste prompt", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ccr-after-cli-"));
    roots.push(root);
    await run("git", ["init", "--quiet", "-b", "main"], { cwd: root });
    await run("git", ["config", "user.name", "CCR Test"], { cwd: root });
    await run("git", ["config", "user.email", "ccr@example.test"], { cwd: root });
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
