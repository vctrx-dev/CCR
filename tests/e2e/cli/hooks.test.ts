import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { automaticContextUpdate } = vi.hoisted(() => ({
  automaticContextUpdate: vi.fn().mockResolvedValue({ status: "updated" }),
}));

vi.mock("../../../src/context/automatic-context-update", () => ({
  runAutomaticContextUpdate: automaticContextUpdate,
}));
import { createCli } from "../../../src/cli/index";
import { createTemporaryRootRegistry, runCommand } from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();

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
  beforeEach(() => {
    automaticContextUpdate.mockClear();
    automaticContextUpdate.mockResolvedValue({ status: "updated" });
  });
  it("should not block disabled setup on an external hook path", async () => {
    const parent = await mkdtemp(path.join(tmpdir(), "ccr-hooks-external-setup-"));
    roots.push(parent);
    const root = path.join(parent, "repository");
    await mkdir(root);
    await runCommand("git", ["init", "--quiet"], { cwd: root });
    await runCommand("git", ["config", "core.hooksPath", "../external-hooks"], { cwd: root });
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
    await runCommand("git", ["init", "--quiet"], { cwd: root });
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
    await createCli(io).parseAsync(["node", "ccr", "hooks", "uninstall", "--dry-run"]);
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
    await runCommand("git", ["init", "--quiet"], { cwd: root });
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
    await runCommand("git", ["init", "--quiet"], { cwd: root });
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
    await expect(
      readFile(path.join(root, ".claude/skills/ccr-hooks/SKILL.md"), "utf8"),
    ).resolves.toBeTruthy();
  });

  it("should report existing markers without state as legacy and unprovenanced", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ccr-hooks-unprovenanced-"));
    roots.push(root);
    await runCommand("git", ["init", "--quiet"], { cwd: root });
    const { io, output, clear } = captureIo(root);
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
    await runCommand("git", ["init", "--quiet"], { cwd: root });
    const { io, output, clear } = captureIo(root);

    await createCli(io).parseAsync(["node", "ccr", "setup", "--dry-run"]);
    expect(output()).toContain("Hooks: enabled");
    await expect(readFile(path.join(root, ".git/hooks/pre-commit"), "utf8")).rejects.toThrow();

    await createCli(io).parseAsync(["node", "ccr", "setup"]);
    expect(output()).toContain("/ccr-hooks sync");
    await expect(readFile(path.join(root, ".git/hooks/pre-commit"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(root, ".git/hooks/post-commit"), "utf8")).rejects.toThrow();
    expect(await readFile(path.join(root, ".gitignore"), "utf8")).toContain(
      "# ccr:start - local context continuity",
    );

    clear();
    await createCli(io).parseAsync(["node", "ccr", "config", "set", "hooks.enabled", "false"]);
    expect(output()).toContain("/ccr-hooks remove");
    await createCli(io).parseAsync(["node", "ccr", "setup"]);
    expect(output()).toContain("CCR hooks disabled by .ccr/config.json");
    await expect(readFile(path.join(root, ".git/hooks/pre-commit"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(root, ".git/hooks/post-commit"), "utf8")).rejects.toThrow();

    await runCommand("git", ["config", "user.name", "CCR Test"], { cwd: root });
    await runCommand("git", ["config", "user.email", "ccr@example.test"], { cwd: root });
    await writeFile(path.join(root, "app.py"), "print(1)\n", "utf8");
    await runCommand("git", ["add", "--", "app.py"], { cwd: root });
    clear();
    await createCli(io).parseAsync(["node", "ccr", "hooks", "pre-commit"]);
    expect(output()).toBe("");
    await runCommand("git", ["commit", "--quiet", "-m", "first"], { cwd: root });
    await createCli(io).parseAsync(["node", "ccr", "hooks", "post-commit"]);
    expect(output()).toBe("");

    await writeFile(
      path.join(root, ".git/hooks/pre-commit"),
      "#!/bin/sh\n# ccr:start - advisory context check\nlegacy command\n# ccr:end\n",
      "utf8",
    );

    clear();
    await createCli(io).parseAsync(["node", "ccr", "hooks", "uninstall", "--dry-run"]);
    expect(output()).toContain("preview");
    expect(await readFile(path.join(root, ".git/hooks/pre-commit"), "utf8")).toContain(
      "legacy command",
    );

    clear();
    await createCli(io).parseAsync(["node", "ccr", "hooks", "uninstall"]);
    expect(output()).toContain("pre-commit removed");
    expect(output()).toContain("post-commit not-installed");
    expect(await readFile(path.join(root, ".git/hooks/pre-commit"), "utf8")).toBe("#!/bin/sh\n");
  }, 30_000);

  it("should run the post-commit check and print a copy-paste prompt", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ccr-after-cli-"));
    roots.push(root);
    await runCommand("git", ["init", "--quiet", "-b", "main"], { cwd: root });
    await runCommand("git", ["config", "user.name", "CCR Test"], { cwd: root });
    await runCommand("git", ["config", "user.email", "ccr@example.test"], { cwd: root });
    const setupIo = captureIo(root).io;
    await createCli(setupIo).parseAsync(["node", "ccr", "config", "init", "--apply"]);
    await writeFile(path.join(root, "app.py"), "print(1)\n", "utf8");
    await runCommand("git", ["add", "."], { cwd: root });
    await runCommand("git", ["commit", "--quiet", "-m", "first"], { cwd: root });

    const { io, output } = captureIo(root);
    await createCli(io).parseAsync(["node", "ccr", "hooks", "post-commit"]);
    expect(output()).toContain("started local journal entry");
    expect(output()).toContain("Use the ccr-context skill");
    expect(output()).toContain("change .ccr/project.md only for durable high-level context");
  });

  it("should run one headless update instead of printing a prompt when opted in", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ccr-after-cli-auto-"));
    roots.push(root);
    await runCommand("git", ["init", "--quiet", "-b", "main"], { cwd: root });
    await runCommand("git", ["config", "user.name", "CCR Test"], { cwd: root });
    await runCommand("git", ["config", "user.email", "ccr@example.test"], { cwd: root });
    const setupIo = captureIo(root).io;
    await createCli(setupIo).parseAsync(["node", "ccr", "config", "init", "--apply"]);
    await createCli(setupIo).parseAsync([
      "node",
      "ccr",
      "config",
      "set",
      "hooks.autoUpdateContext",
      "true",
      "--apply",
    ]);
    await writeFile(path.join(root, "app.py"), "print(1)\n", "utf8");
    await runCommand("git", ["add", "--", "app.py"], { cwd: root });
    await runCommand("git", ["commit", "--quiet", "-m", "first"], { cwd: root });

    const { io, output, clear } = captureIo(root);
    await createCli(io).parseAsync(["node", "ccr", "hooks", "post-commit"]);

    expect(automaticContextUpdate).toHaveBeenCalledOnce();
    const [calledRoot, calledCommit] = automaticContextUpdate.mock.calls[0] ?? [];
    expect(path.normalize(calledRoot)).toBe(path.normalize(root));
    expect(calledCommit).toMatch(/^[a-f0-9]{40}$/);
    expect(output()).toContain("automatic context update completed");
    expect(output()).not.toContain("Paste this into Claude Code");

    for (const [status, expected] of [
      ["already-updated", "already completed for this commit"],
      ["in-progress", "already running"],
    ] as const) {
      automaticContextUpdate.mockResolvedValueOnce({ status });
      clear();
      await createCli(io).parseAsync(["node", "ccr", "hooks", "post-commit"]);
      expect(output()).toContain(expected);
      expect(output()).not.toContain("Paste this into Claude Code");
    }

    automaticContextUpdate.mockRejectedValueOnce(new Error("provider failed"));
    clear();
    await createCli(io).parseAsync(["node", "ccr", "hooks", "post-commit"]);
    expect(output()).toContain("automatic context update failed");
    expect(output()).toContain("/ccr-context update");

    automaticContextUpdate.mockResolvedValueOnce({ status: "updated" });
    clear();
    await createCli(io).parseAsync(["node", "ccr", "hooks", "post-commit"]);
    expect(output()).toContain("automatic context update completed");
  });

  it("should retain hidden compatibility aliases for previously generated hooks", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ccr-hook-aliases-"));
    roots.push(root);
    await runCommand("git", ["init", "--quiet", "-b", "main"], { cwd: root });
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

  it.each([
    ["missing", undefined],
    ["invalid", "{ not valid json\n"],
  ])("should fail visibly when hook configuration is %s", async (_condition, config) => {
    const root = await mkdtemp(path.join(tmpdir(), "ccr-hook-invalid-config-"));
    roots.push(root);
    await runCommand("git", ["init", "--quiet", "-b", "main"], { cwd: root });
    if (config !== undefined) {
      await mkdir(path.join(root, ".ccr"));
      await writeFile(path.join(root, ".ccr/config.json"), config, "utf8");
    }
    const { io } = captureIo(root);

    await expect(createCli(io).parseAsync(["node", "ccr", "hooks", "pre-commit"])).rejects.toThrow(
      /CCR hook settings are unavailable/i,
    );
    await expect(createCli(io).parseAsync(["node", "ccr", "hooks", "post-commit"])).rejects.toThrow(
      /CCR hook settings are unavailable/i,
    );
  });
});
