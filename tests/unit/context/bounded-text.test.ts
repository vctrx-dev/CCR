import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import {
  readBoundedTextIfExists,
  readBoundedUtf8TextIfExists,
} from "../../../src/context/bounded-text";
import { createTemporaryRootRegistry } from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();

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

it("should classify bounded NUL and invalid UTF-8 content as binary", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-bounded-binary-files-"));
  roots.push(root);
  const nulTarget = path.join(root, "nul.bin");
  const invalidTarget = path.join(root, "invalid.bin");
  await writeFile(nulTarget, Buffer.from([0x61, 0x00, 0x62]));
  await writeFile(invalidTarget, Buffer.from([0x61, 0xff, 0x62]));

  await expect(readBoundedUtf8TextIfExists(nulTarget, 10)).resolves.toMatchObject({
    isBinary: true,
  });
  await expect(readBoundedUtf8TextIfExists(invalidTarget, 10)).resolves.toMatchObject({
    isBinary: true,
  });
});

it("should not classify a valid multibyte sequence cut at the bounded byte edge as binary", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-bounded-tail-files-"));
  roots.push(root);
  const target = path.join(root, "tail.txt");
  await writeFile(target, "aaaaaa😀tail", "utf8");

  await expect(readBoundedUtf8TextIfExists(target, 1)).resolves.toEqual({
    content: "a",
    isTruncated: true,
    isBinary: false,
  });
});
