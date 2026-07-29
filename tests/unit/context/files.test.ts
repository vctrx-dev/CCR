import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { writeManagedText } from "../../../src/context/files";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

it("should atomically write inside the repository and reject traversal", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-files-"));
  roots.push(root);

  await writeManagedText(root, ".ccr/context.md", "safe\n");
  expect(await readFile(path.join(root, ".ccr/context.md"), "utf8")).toBe("safe\n");
  await expect(writeManagedText(root, "../outside.md", "unsafe\n")).rejects.toThrow(
    "escapes the repository",
  );
});
