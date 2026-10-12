import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createCli } from "../../../src/cli/index";
import type { HookState } from "../../../src/context/hook-state";
import { applySetup } from "../../../src/context/setup";
import { applyUninstall, previewUninstall } from "../../../src/context/uninstall";
import {
  createTemporaryGitRepository,
  createTemporaryRootRegistry,
} from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();
const options = { purge: true };
const statePath = ".ccr/private/hooks-state.json";

async function repository(): Promise<string> {
  const root = await createTemporaryGitRepository(roots, "ccr-purge-");
  await applySetup(root);
  return root;
}

function artifact(
  file: string,
  original: string,
  events: ("pre-commit" | "post-commit")[],
  existed = true,
  separatorByteCount: 0 | 1 | 2 = 0,
): HookState["artifacts"][number] {
  return {
    path: file,
    events,
    existed,
    separatorByteCount,
    originalByteLength: Buffer.byteLength(original),
    originalSha256: createHash("sha256").update(original).digest("hex"),
  };
}

async function record(
  root: string,
  artifacts: HookState["artifacts"],
  frameworkSourcePath: string | null = null,
): Promise<void> {
  await writeFile(
    path.join(root, statePath),
    JSON.stringify({
      schemaVersion: 1,
      strategy: frameworkSourcePath === null ? "existing-native" : "repository-framework",
      strategyDescription: "Test hook integration",
      frameworkSourcePath,
      ccrEntryId: frameworkSourcePath === null ? null : "ccr-checks",
      artifacts,
    }),
    "utf8",
  );
}

describe("full CCR cleanup", () => {
  it("previews and deletes all .ccr data while preserving unrelated files and hook bytes", async () => {
    const root = await repository();
    await mkdir(path.join(root, ".ccr/cache/nested"), { recursive: true });
    await mkdir(path.join(root, ".ccr/journal/empty"), { recursive: true });
    await writeFile(path.join(root, ".ccr/cache/nested/binary"), Buffer.from([0, 255, 1, 128]));
    await writeFile(path.join(root, ".ccr/config.local.json"), "private settings");
    await writeFile(path.join(root, "app.txt"), "unrelated");
    await mkdir(path.join(root, ".claude/skills/other"), { recursive: true });
    await writeFile(path.join(root, ".claude/skills/other/SKILL.md"), "other skill");
    const hook = "#!/bin/sh\r\nnpm test\r\n";
    const installed = `${hook}# ccr:start - advisory context check\r\nDO NOT EXECUTE\r\n# ccr:end\r\n`;
    await writeFile(path.join(root, ".git/hooks/pre-commit"), installed);
    let output = "";
    const io = {
      cwd: root,
      write: (message: string) => {
        output += message;
      },
    };
    await createCli(io).parseAsync(["node", "ccr", "uninstall", "--dry-run"]);
    expect(output).toContain(".git/hooks/pre-commit");
    expect(output).toContain("entire .ccr directory will be deleted");
    expect(output).toContain("Run `ccr uninstall`");
    expect(await readFile(path.join(root, ".git/hooks/pre-commit"), "utf8")).toBe(installed);
    expect(await readFile(path.join(root, ".ccr/config.local.json"), "utf8")).toBe(
      "private settings",
    );
    await createCli(io).parseAsync(["node", "ccr", "uninstall"]);
    await expect(lstat(path.join(root, ".ccr"))).rejects.toThrow();
    await expect(lstat(path.join(root, ".claude/skills/ccr"))).rejects.toThrow();
    expect(await readFile(path.join(root, ".git/hooks/pre-commit"), "utf8")).toBe(hook);
    expect(await readFile(path.join(root, "app.txt"), "utf8")).toBe("unrelated");
    expect(await readFile(path.join(root, ".claude/skills/other/SKILL.md"), "utf8")).toBe(
      "other skill",
    );
    expect(await readFile(path.join(root, ".gitignore"), "utf8")).not.toContain("ccr:start");
    await createCli(io).parseAsync(["node", "ccr", "uninstall", "--purge"]);
    await expect(lstat(path.join(root, ".ccr"))).rejects.toThrow();
  });

  it.each(["\n", "\r\n"])(
    "restores native and framework hooks exactly with %j separators",
    async (newline) => {
      const root = await repository();
      const native = `#!/usr/bin/env python${newline}print('user check')`;
      const yaml = `repos:${newline}  - repo: local${newline}    hooks: []${newline}`;
      await writeFile(
        path.join(root, ".git/hooks/pre-commit"),
        `${native}${newline}# ccr:start${newline}not executed${newline}# ccr:end${newline}`,
      );
      await chmod(path.join(root, ".git/hooks/pre-commit"), 0o700);
      const mode = (await lstat(path.join(root, ".git/hooks/pre-commit"))).mode & 0o777;
      await writeFile(
        path.join(root, ".pre-commit-config.yaml"),
        `${yaml}# ccr:start${newline}ccr-checks${newline}# ccr:end${newline}`,
      );
      await record(
        root,
        [
          artifact(".git/hooks/pre-commit", native, ["pre-commit"], true, newline.length as 1 | 2),
          artifact(".pre-commit-config.yaml", yaml, ["post-commit"]),
        ],
        ".pre-commit-config.yaml",
      );
      await applyUninstall(root, true, undefined, options);
      expect(await readFile(path.join(root, ".git/hooks/pre-commit"), "utf8")).toBe(native);
      expect((await lstat(path.join(root, ".git/hooks/pre-commit"))).mode & 0o777).toBe(mode);
      expect(await readFile(path.join(root, ".pre-commit-config.yaml"), "utf8")).toBe(yaml);
      await expect(lstat(path.join(root, ".ccr"))).rejects.toThrow();
    },
  );

  it("deletes newly created CCR-only hooks, but preserves an original shebang stub", async () => {
    const root = await repository();
    const block = "# ccr:start\nccr command\n# ccr:end\n";
    await writeFile(path.join(root, ".git/hooks/pre-commit"), `#!/bin/sh\n${block}`);
    await writeFile(path.join(root, ".git/hooks/post-commit"), `#!/bin/sh\n${block}`);
    await record(root, [
      artifact(".git/hooks/pre-commit", "", ["pre-commit"], false),
      artifact(".git/hooks/post-commit", "#!/bin/sh\n", ["post-commit"]),
    ]);
    await applyUninstall(root, true, undefined, options);
    await expect(lstat(path.join(root, ".git/hooks/pre-commit"))).rejects.toThrow();
    expect(await readFile(path.join(root, ".git/hooks/post-commit"), "utf8")).toBe("#!/bin/sh\n");
  });

  it.each(["wrong hash", "malformed", "unrelated addition", "unsupported entries"])(
    "stops before cleanup for %s",
    async (reason) => {
      const root = await repository();
      const original = "#!/bin/sh\nnpm test\n";
      let current = `${original}# ccr:start\nccr command\n# ccr:end\n`;
      if (reason === "malformed") current = current.replace("# ccr:end\n", "");
      if (reason === "unrelated addition") current += "npm run extra\n";
      if (reason === "unsupported entries") current = `${original}ccr command without markers\n`;
      await writeFile(path.join(root, ".git/hooks/pre-commit"), current);
      await record(root, [
        artifact(".git/hooks/pre-commit", reason === "wrong hash" ? "other original" : original, [
          "pre-commit",
        ]),
        artifact(".git/hooks/post-commit", "", ["post-commit"], false),
      ]);
      await expect(applyUninstall(root, true, undefined, options)).rejects.toThrow();
      expect(await readFile(path.join(root, ".git/hooks/pre-commit"), "utf8")).toBe(current);
      await expect(
        readFile(path.join(root, ".claude/skills/ccr/SKILL.md"), "utf8"),
      ).resolves.toContain("managed by CCR");
      await expect(readFile(path.join(root, statePath), "utf8")).resolves.toContain(
        "schemaVersion",
      );
      await expect(readFile(path.join(root, ".ccr/config.json"), "utf8")).resolves.toBeTruthy();
    },
  );

  it.each(["new file", "changed data", "hook edit", "state edit"])(
    "rejects %s after preview before deleting files",
    async (change) => {
      const root = await repository();
      const original = "#!/bin/sh\n";
      const current = `${original}# ccr:start\nccr command\n# ccr:end\n`;
      await writeFile(path.join(root, ".git/hooks/pre-commit"), current);
      await record(root, [
        artifact(".git/hooks/pre-commit", original, ["pre-commit"]),
        artifact(".git/hooks/post-commit", "", ["post-commit"], false),
      ]);
      const preview = await previewUninstall(root, true, options);
      if (change === "new file") await writeFile(path.join(root, ".ccr/new.txt"), "new");
      if (change === "changed data")
        await writeFile(path.join(root, ".ccr/project.md"), "human edit");
      if (change === "hook edit")
        await writeFile(path.join(root, ".git/hooks/pre-commit"), `${current}human edit\n`);
      if (change === "state edit") await writeFile(path.join(root, statePath), "{}");
      await expect(applyUninstall(root, true, preview, options)).rejects.toThrow(
        /changed after preview/,
      );
      await expect(
        readFile(path.join(root, ".claude/skills/ccr/SKILL.md"), "utf8"),
      ).resolves.toContain("managed by CCR");
    },
  );

  it("refuses symlinks inside .ccr without deleting their targets or integrations", async () => {
    const root = await repository();
    await mkdir(path.join(root, "user-data"));
    await writeFile(path.join(root, "user-data/keep.txt"), "keep");
    await symlink(path.join(root, "user-data"), path.join(root, ".ccr/link"), "junction");
    await expect(applyUninstall(root, true, undefined, options)).rejects.toThrow(/symbolic link/);
    expect(await readFile(path.join(root, "user-data/keep.txt"), "utf8")).toBe("keep");
    await expect(
      readFile(path.join(root, ".claude/skills/ccr/SKILL.md"), "utf8"),
    ).resolves.toBeTruthy();
  });

  it("keep-context cleans recorded hooks but keeps context and journals", async () => {
    const root = await repository();
    const current = "# ccr:start\nccr command\n# ccr:end\n";
    await writeFile(path.join(root, ".git/hooks/pre-commit"), current);
    await record(root, [
      artifact(".git/hooks/pre-commit", "", ["pre-commit"], false),
      artifact(".git/hooks/post-commit", "", ["post-commit"], false),
    ]);
    await createCli({ cwd: root, write: () => {} }).parseAsync([
      "node",
      "ccr",
      "uninstall",
      "--keep-context",
    ]);
    await expect(lstat(path.join(root, ".git/hooks/pre-commit"))).rejects.toThrow();
    await expect(lstat(path.join(root, statePath))).rejects.toThrow();
    await expect(readFile(path.join(root, ".ccr/project.md"), "utf8")).resolves.toBeTruthy();
  });

  it.each(["unrecorded markers", "invalid state", "active write lock", "unowned skill"])(
    "refuses %s before removing integration",
    async (reason) => {
      const root = await repository();
      if (reason === "unrecorded markers")
        await writeFile(path.join(root, ".git/hooks/pre-commit"), "# ccr:start\nccr\n# ccr:end\n");
      if (reason === "invalid state") await writeFile(path.join(root, statePath), "{}");
      if (reason === "active write lock") {
        await mkdir(path.join(root, ".ccr/private/managed-write-locks/pending.lock"), {
          recursive: true,
        });
        await writeFile(
          path.join(root, ".ccr/private/managed-write-locks/pending.lock/owner"),
          "pending",
        );
      }
      if (reason === "unowned skill")
        await writeFile(path.join(root, ".claude/skills/ccr/SKILL.md"), "human-owned skill");
      await expect(applyUninstall(root, true, undefined, options)).rejects.toThrow();
      await expect(readFile(path.join(root, ".ccr/config.json"), "utf8")).resolves.toBeTruthy();
      await expect(
        readFile(path.join(root, ".claude/skills/ccr-review/SKILL.md"), "utf8"),
      ).resolves.toBeTruthy();
    },
  );

  it("derives safe hook changes again rather than trusting modified preview contents", async () => {
    const root = await repository();
    const original = "#!/bin/sh\nnpm test\n";
    await writeFile(
      path.join(root, ".git/hooks/pre-commit"),
      `${original}# ccr:start\nccr\n# ccr:end\n`,
    );
    await record(root, [
      artifact(".git/hooks/pre-commit", original, ["pre-commit"]),
      artifact(".git/hooks/post-commit", "", ["post-commit"], false),
    ]);
    const preview = await previewUninstall(root, true, options);
    if (preview.hooks?.kind !== "recorded") throw new Error("Expected recorded hook preview");
    preview.hooks.removals[0].restored = "unapproved replacement";
    await applyUninstall(root, true, preview, options);
    expect(await readFile(path.join(root, ".git/hooks/pre-commit"), "utf8")).toBe(original);
  });

  it("rejects aliased duplicate hook paths and uncovered framework sources", async () => {
    const root = await repository();
    await writeFile(path.join(root, ".git/hooks/pre-commit"), "# ccr:start\nccr\n# ccr:end\n");
    await record(root, [
      artifact(".git/hooks/pre-commit", "", ["pre-commit"], false),
      artifact("./.git/hooks/pre-commit", "", ["post-commit"], false),
    ]);
    await expect(previewUninstall(root, true, options)).rejects.toThrow(
      /Invalid recorded hook path/,
    );
    await record(
      root,
      [
        artifact(".git/hooks/pre-commit", "", ["pre-commit"], false),
        artifact(".git/hooks/post-commit", "", ["post-commit"], false),
      ],
      ".pre-commit-config.yaml",
    );
    await expect(previewUninstall(root, true, options)).rejects.toThrow(/not covered/);
    await expect(readFile(path.join(root, ".ccr/config.json"), "utf8")).resolves.toBeTruthy();
  });

  it("refuses a symlinked .ccr root without removing outside data", async () => {
    const root = await createTemporaryGitRepository(roots, "ccr-purge-linked-");
    await mkdir(path.join(root, "outside"));
    await writeFile(path.join(root, "outside/keep"), "keep");
    await symlink(path.join(root, "outside"), path.join(root, ".ccr"), "junction");
    await expect(previewUninstall(root, true, options)).rejects.toThrow(/symbolic link/);
    expect(await readFile(path.join(root, "outside/keep"), "utf8")).toBe("keep");
  });
});
