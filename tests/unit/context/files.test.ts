import { mkdtemp, readFile, readdir, rename, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import {
  createManagedTextExclusive,
  deleteManagedTextIfUnchanged,
  tryAcquireManagedLock,
  writeManagedText,
  writeManagedTextIfUnchanged,
} from "../../../src/context/files";
import { createTemporaryRootRegistry } from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();

it("should atomically write inside the repository and reject traversal", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-files-"));
  roots.push(root);

  await writeManagedText(root, ".ccr/context.md", "safe\n");
  expect(await readFile(path.join(root, ".ccr/context.md"), "utf8")).toBe("safe\n");
  await expect(writeManagedText(root, "../outside.md", "unsafe\n")).rejects.toThrow(
    "escapes the repository",
  );
});

it("should hold an exclusive managed lock and permit release more than once", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-lock-files-"));
  roots.push(root);
  const release = await tryAcquireManagedLock(root, ".ccr/private/test.lock");
  expect(release).toBeTypeOf("function");
  await expect(tryAcquireManagedLock(root, ".ccr/private/test.lock")).resolves.toBeUndefined();
  await release?.();
  await expect(release?.()).resolves.toBeUndefined();
});

it("should preserve a replacement lock when an earlier owner releases", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-owned-lock-files-"));
  roots.push(root);
  const relativePath = ".ccr/private/test.lock";
  const target = path.join(root, relativePath);
  const firstRelease = await tryAcquireManagedLock(root, relativePath);
  expect(firstRelease).toBeTypeOf("function");

  await rename(target, `${target}.orphaned`);
  const secondRelease = await tryAcquireManagedLock(root, relativePath);
  expect(secondRelease).toBeTypeOf("function");
  await firstRelease?.();
  await expect(tryAcquireManagedLock(root, relativePath)).resolves.toBeUndefined();
  await secondRelease?.();
});

it("should create managed text exclusively without overwriting a concurrent winner", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-exclusive-files-"));
  roots.push(root);
  const relativePath = ".ccr/journal/main/entry.md";

  expect(await createManagedTextExclusive(root, relativePath, "first\n")).toBe(true);
  expect(await createManagedTextExclusive(root, relativePath, "second\n")).toBe(false);
  expect(await readFile(path.join(root, relativePath), "utf8")).toBe("first\n");
});

it("should compare and replace managed text while serializing cooperating writers", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-cas-files-"));
  roots.push(root);
  const relativePath = ".ccr/config.json";
  await writeManagedText(root, relativePath, "before\n");

  const results = await Promise.all([
    writeManagedTextIfUnchanged(root, relativePath, "before\n", "first\n"),
    writeManagedTextIfUnchanged(root, relativePath, "before\n", "second\n"),
  ]);
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(["first\n", "second\n"]).toContain(await readFile(path.join(root, relativePath), "utf8"));
  await expect(readdir(path.join(root, ".ccr/private/managed-write-locks"))).resolves.toEqual([]);
});

it("should delete managed text only while its observed content is unchanged", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-delete-cas-files-"));
  roots.push(root);
  const relativePath = ".ccr/private/evidence.json";
  await writeManagedText(root, relativePath, "replacement\n");

  expect(await deleteManagedTextIfUnchanged(root, relativePath, "original\n")).toBe(false);
  expect(await readFile(path.join(root, relativePath), "utf8")).toBe("replacement\n");
  expect(await deleteManagedTextIfUnchanged(root, relativePath, "replacement\n")).toBe(true);
  expect(await deleteManagedTextIfUnchanged(root, relativePath, "replacement\n")).toBe(false);
});

it("should reject managed compare-and-delete through a symbolic-link directory", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-delete-symlink-files-"));
  const outside = await mkdtemp(path.join(tmpdir(), "ccr-delete-symlink-target-"));
  roots.push(root, outside);
  await writeFile(path.join(outside, "evidence.json"), "outside\n");
  await symlink(outside, path.join(root, ".ccr"), "junction");

  await expect(
    deleteManagedTextIfUnchanged(root, ".ccr/evidence.json", "outside\n"),
  ).rejects.toThrow("crosses a symbolic link");
  expect(await readFile(path.join(outside, "evidence.json"), "utf8")).toBe("outside\n");
});
