import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import {
  previewContextHookRemoval,
  readContextHookStatus,
  removeAllContextHooks,
  removeContextHook,
  validateContextHookRemoval,
} from "../../../src/context/hooks";
import { createTemporaryRootRegistry, runCommand } from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();

async function createRepository(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-hooks-"));
  roots.push(root);
  await runCommand("git", ["init", "--quiet"], { cwd: root });
  return root;
}

it("should report an external configured hooks path as unsafe without throwing", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "ccr-hooks-boundary-"));
  roots.push(parent);
  const root = path.join(parent, "repository");
  await mkdir(root);
  await runCommand("git", ["init", "--quiet"], { cwd: root });
  await runCommand("git", ["config", "core.hooksPath", "../external-hooks"], { cwd: root });

  const result = await readContextHookStatus(root);

  expect(result.status).toBe("unsafe");
  expect(result.path).toBe(path.join(parent, "external-hooks", "pre-commit"));
});

it("should inspect the Git common hook directory from a linked worktree", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "ccr-hooks-worktree-"));
  roots.push(parent);
  const main = path.join(parent, "main");
  const linked = path.join(parent, "linked");
  await mkdir(main);
  await runCommand("git", ["init", "--quiet", "-b", "main"], { cwd: main });
  await runCommand("git", ["config", "user.name", "CCR Test"], { cwd: main });
  await runCommand("git", ["config", "user.email", "ccr@example.test"], { cwd: main });
  await writeFile(path.join(main, "tracked.txt"), "tracked\n", "utf8");
  await runCommand("git", ["add", "tracked.txt"], { cwd: main });
  await runCommand("git", ["commit", "--quiet", "-m", "initial"], { cwd: main });
  const isolatedGitEnvironment = { ...process.env };
  isolatedGitEnvironment.GIT_INDEX_FILE = undefined;
  isolatedGitEnvironment.GIT_DIR = undefined;
  isolatedGitEnvironment.GIT_WORK_TREE = undefined;
  await runCommand("git", ["worktree", "add", "--quiet", "-b", "linked", linked], {
    cwd: main,
    env: isolatedGitEnvironment,
  });

  const result = await readContextHookStatus(linked);

  expect(result.status).toBe("not-installed");
  expect(result.path).toBe(path.join(main, ".git", "hooks", "pre-commit"));
});

it("should reject a configured hook directory that crosses a symlink", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "ccr-hooks-symlink-"));
  roots.push(parent);
  const root = path.join(parent, "repository");
  const external = path.join(parent, "external-hooks");
  await mkdir(root);
  await mkdir(external);
  await runCommand("git", ["init", "--quiet"], { cwd: root });
  await symlink(external, path.join(root, ".managed-hooks"), "junction");
  await runCommand("git", ["config", "core.hooksPath", ".managed-hooks"], { cwd: root });

  expect((await readContextHookStatus(root)).status).toBe("unsafe");
  await expect(removeContextHook(root)).rejects.toThrow(/outside the repository/i);
});

it("should distinguish current, stale, malformed, and absent legacy blocks", async () => {
  const root = await createRepository();
  const hookPath = path.join(root, ".git/hooks/pre-commit");
  expect((await readContextHookStatus(root)).status).toBe("not-installed");

  await writeFile(
    hookPath,
    "#!/bin/sh\n# ccr:start - advisory context check\nold ccr command\n# ccr:end\n",
    "utf8",
  );
  expect((await readContextHookStatus(root)).status).toBe("stale");

  await writeFile(
    hookPath,
    '#!/bin/sh\n# ccr:start - advisory context check\nnpx --no-install ccr hooks pre-commit || echo "CCR: context check unavailable; commit continues." >&2\n# ccr:end\n',
    "utf8",
  );
  expect((await readContextHookStatus(root)).status).toBe("current");

  const current = await readFile(hookPath, "utf8");
  await writeFile(hookPath, current.replaceAll("\n", "\r\n"), "utf8");
  expect((await readContextHookStatus(root)).status).toBe("current");

  await writeFile(hookPath, "#!/bin/sh\n# ccr:start - advisory context check\n", "utf8");
  expect((await readContextHookStatus(root)).status).toBe("malformed");
});

it("should report unavailable Git hook metadata without throwing", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-hooks-unavailable-"));
  roots.push(root);

  expect((await readContextHookStatus(root)).status).toBe("unavailable");
});

it("should preserve every byte outside an unprovenanced legacy marker block", async () => {
  const root = await createRepository();
  const hookPath = path.join(root, ".git/hooks/pre-commit");
  const original = "#!/bin/sh\r\npnpm test\r\n";
  await writeFile(
    hookPath,
    `${original}\r\n# ccr:start - advisory context check\r\nlegacy command\r\n# ccr:end\r\n`,
    "utf8",
  );

  expect((await removeContextHook(root)).status).toBe("removed");
  expect(await readFile(hookPath, "utf8")).toBe(`${original}\r\n`);
});

it.each(["\n", "\r\n"])(
  "should preserve a direct-append hook line ending %j during legacy cleanup",
  async (newline) => {
    const root = await createRepository();
    const hookPath = path.join(root, ".git/hooks/pre-commit");
    const original = `#!/bin/sh${newline}`;
    await writeFile(
      hookPath,
      `${original}# ccr:start - advisory context check${newline}legacy command${newline}# ccr:end${newline}`,
      "utf8",
    );

    expect((await removeContextHook(root)).status).toBe("removed");
    expect(await readFile(hookPath, "utf8")).toBe(original);
  },
);

it.each([
  "#!/bin/sh\n# ccr:start - advisory context check\nmissing end\n",
  [
    "#!/bin/sh",
    "# ccr:start - advisory context check",
    "first",
    "# ccr:end",
    "# ccr:start - advisory context check",
    "second",
    "# ccr:end",
    "",
  ].join("\n"),
])("should reject malformed or duplicate managed markers without mutation", async (existing) => {
  const root = await createRepository();
  const hookPath = path.join(root, ".git/hooks/pre-commit");
  await writeFile(hookPath, existing, "utf8");

  await expect(removeContextHook(root)).rejects.toThrow(/managed block conflict/i);
  expect(await readFile(hookPath, "utf8")).toBe(existing);
});

it("should remove a post-commit legacy block independently of pre-commit", async () => {
  const root = await createRepository();
  const hookPath = path.join(root, ".git/hooks/post-commit");
  await writeFile(
    hookPath,
    '#!/bin/sh\n# ccr:start - post-commit context check\nnpx --no-install ccr hooks post-commit || echo "CCR: post-commit context check unavailable." >&2\n# ccr:end\n',
    "utf8",
  );
  expect((await readContextHookStatus(root, "post-commit")).status).toBe("current");

  expect((await removeContextHook(root, "post-commit")).status).toBe("removed");
  expect(await readFile(hookPath, "utf8")).not.toContain("ccr");
});

it("should remove both legacy advisory hooks", async () => {
  const root = await createRepository();
  await writeFile(
    path.join(root, ".git/hooks/pre-commit"),
    '#!/bin/sh\n# ccr:start - advisory context check\nnpx --no-install ccr hooks pre-commit || echo "CCR: context check unavailable; commit continues." >&2\n# ccr:end\n',
    "utf8",
  );
  await writeFile(
    path.join(root, ".git/hooks/post-commit"),
    '#!/bin/sh\n# ccr:start - post-commit context check\nnpx --no-install ccr hooks post-commit || echo "CCR: post-commit context check unavailable." >&2\n# ccr:end\n',
    "utf8",
  );

  const removed = await removeAllContextHooks(root);
  expect(removed.preCommit.status).toBe("removed");
  expect(removed.postCommit.status).toBe("removed");
});

it("should validate both legacy hooks before writing either one", async () => {
  const root = await createRepository();
  const preCommitPath = path.join(root, ".git/hooks/pre-commit");
  const preCommit =
    '#!/bin/sh\n\n# ccr:start - advisory context check\nnpx --no-install ccr hooks pre-commit || echo "CCR: context check unavailable; commit continues." >&2\n# ccr:end\n';
  await writeFile(preCommitPath, preCommit, "utf8");
  await writeFile(
    path.join(root, ".git/hooks/post-commit"),
    "#!/bin/sh\n# ccr:start - post-commit context check\nmissing end\n",
    "utf8",
  );

  await expect(removeAllContextHooks(root)).rejects.toThrow(/managed block conflict/i);
  expect(await readFile(preCommitPath, "utf8")).toBe(preCommit);
});

it("should reject drift after a two-hook removal preview before writing", async () => {
  const root = await createRepository();
  const preCommitPath = path.join(root, ".git/hooks/pre-commit");
  const postCommitPath = path.join(root, ".git/hooks/post-commit");
  const preCommit =
    '#!/bin/sh\n\n# ccr:start - advisory context check\nnpx --no-install ccr hooks pre-commit || echo "CCR: context check unavailable; commit continues." >&2\n# ccr:end\n';
  const postCommit =
    '#!/bin/sh\n\n# ccr:start - post-commit context check\nnpx --no-install ccr hooks post-commit || echo "CCR: post-commit context check unavailable." >&2\n# ccr:end\n';
  await writeFile(preCommitPath, preCommit, "utf8");
  await writeFile(postCommitPath, postCommit, "utf8");
  const preview = await previewContextHookRemoval(root);
  await writeFile(postCommitPath, `${postCommit}changed after preview\n`, "utf8");

  await expect(validateContextHookRemoval(root, preview)).rejects.toThrow(/changed after preview/i);
  await expect(removeAllContextHooks(root, preview)).rejects.toThrow(/changed after preview/i);
  expect(await readFile(preCommitPath, "utf8")).toBe(preCommit);
});
