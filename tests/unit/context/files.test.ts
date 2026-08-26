import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import {
  fingerprintManagedTree,
  readBoundedTextIfExists,
  tryAcquireManagedLock,
  writeManagedText,
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

it("should read only a bounded text prefix and report truncation", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-bounded-files-"));
  roots.push(root);
  const target = path.join(root, "large.txt");
  await writeFile(target, `${"a".repeat(12)}tail`, "utf8");

  await expect(
    readBoundedTextIfExists(path.join(root, "missing.txt"), 12),
  ).resolves.toBeUndefined();
  await expect(readBoundedTextIfExists(target, 12)).resolves.toEqual({
    content: "a".repeat(12),
    isTruncated: true,
  });
});

it("should preserve a multibyte UTF-16 prefix ending with an emoji", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-bounded-utf8-files-"));
  roots.push(root);
  const target = path.join(root, "multibyte.txt");
  const prefix = "漢😀";
  await writeFile(target, `${prefix}${"漢".repeat(3)}`, "utf8");

  await expect(readBoundedTextIfExists(target, prefix.length)).resolves.toEqual({
    content: prefix,
    isTruncated: true,
  });
});

it("should bound managed-tree fingerprints and tolerate an absent tree", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-fingerprint-files-"));
  roots.push(root);
  await expect(fingerprintManagedTree(root, ".ccr")).resolves.toEqual(new Map());
  await mkdir(path.join(root, ".ccr/nested"), { recursive: true });
  await writeFile(path.join(root, ".ccr/nested/context.md"), "context\n");

  expect(await fingerprintManagedTree(root, ".ccr")).toEqual(
    new Map([[".ccr/nested/context.md", expect.stringMatching(/^[a-f0-9]{64}$/u)]]),
  );
  await expect(fingerprintManagedTree(root, ".ccr", 0)).rejects.toThrow("file limit");
  await expect(fingerprintManagedTree(root, ".ccr", 1, 2)).rejects.toThrow("content limit");
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
