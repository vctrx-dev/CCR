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

it("should distinguish current, stale, malformed, and absent legacy blocks", async () => {
  const root = await createRepository();
  const hookPath = path.join(root, ".git/hooks/pre-commit");
  expect((await readContextHookStatus(root)).status).toBe("not-installed");

  await writeFile(hookPath, "#!/bin/sh\n# ccr:start\nold ccr command\n# ccr:end\n", "utf8");
  expect((await readContextHookStatus(root)).status).toBe("stale");

  await writeFile(
    hookPath,
    '#!/bin/sh\n# ccr:start - advisory context check\nnode .ccr/private/runtime/dist/cli/index.cjs hooks pre-commit || echo "CCR: context check unavailable; commit continues." >&2\n# ccr:end\n',
    "utf8",
  );
  expect((await readContextHookStatus(root)).status).toBe("current");

  const current = await readFile(hookPath, "utf8");
  await writeFile(hookPath, current.replaceAll("\n", "\r\n"), "utf8");
  expect((await readContextHookStatus(root)).status).toBe("current");

  await writeFile(hookPath, "#!/bin/sh\n# ccr:start - advisory context check\n", "utf8");
  expect((await readContextHookStatus(root)).status).toBe("malformed");
  await writeFile(hookPath, "# ccr:start\n# ccr:start - duplicate\n# ccr:end\n");
  await expect(removeContextHook(root)).rejects.toThrow(/managed block conflict/i);
});

it("should reject symlinked hook files even when their targets are inside the repository", async () => {
  const root = await createRepository();
  const directory = path.join(root, "original-hooks");
  await mkdir(directory);
  const content = "#!/bin/sh\n# ccr:start - advisory context check\nccr\n# ccr:end\n";
  await writeFile(path.join(directory, "pre-commit"), content);
  await symlink(directory, path.join(root, ".managed-hooks"), "junction");
  await runCommand("git", ["config", "core.hooksPath", ".managed-hooks"], { cwd: root });
  await expect(previewContextHookRemoval(root)).rejects.toThrow(/symbolic-link/);
  expect(await readFile(path.join(directory, "pre-commit"), "utf8")).toBe(content);
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
