import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import {
  readCompleteJournalEntry,
  readJournalEvidence,
  readSortedJournalNames,
  refreshJournalEntry,
  writeJournalFile,
} from "../../../src/context/journal-entry";
import { createTemporaryRootRegistry } from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();

it("should bound complete journal reads and writes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-complete-journal-bound-"));
  roots.push(root);
  await mkdir(path.join(root, ".ccr/journal/main"), { recursive: true });
  const relativePath = ".ccr/journal/main/2026-07-29.md";

  await expect(readCompleteJournalEntry(root, relativePath)).rejects.toThrow("disappeared");
  await writeJournalFile(root, relativePath, "bounded\n");
  await expect(readCompleteJournalEntry(root, relativePath)).resolves.toBe("bounded\n");
  await expect(writeJournalFile(root, relativePath, "x".repeat(64_001))).rejects.toThrow(
    "exceeds 64000 characters",
  );
});

it("should reject a recognized journal name that is a symbolic link", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-journal-symlink-"));
  roots.push(root);
  const directory = path.join(root, ".ccr/journal/main");
  const target = path.join(root, "outside");
  await mkdir(directory, { recursive: true });
  await mkdir(target);
  await symlink(target, path.join(directory, "2026-07-29.md"), "junction");

  await expect(readSortedJournalNames(root, ".ccr/journal/main")).rejects.toThrow("symbolic link");
});

it("should reject malformed UTF-8 and NUL bytes in complete journal entries", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-complete-journal-utf8-"));
  roots.push(root);
  await mkdir(path.join(root, ".ccr/journal/main"), { recursive: true });
  const relativePath = ".ccr/journal/main/2026-07-29.md";
  const target = path.join(root, relativePath);

  await writeFile(target, Buffer.from("# CCR Journal\n\0", "utf8"));
  await expect(readCompleteJournalEntry(root, relativePath)).rejects.toThrow("valid UTF-8 text");

  await writeFile(
    target,
    Buffer.concat([Buffer.from("# CCR Journal\n", "utf8"), Buffer.from([255])]),
  );
  await expect(readCompleteJournalEntry(root, relativePath)).rejects.toThrow("valid UTF-8 text");
});

it("should reject malformed bytes beyond the presented journal evidence prefix", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-journal-evidence-utf8-"));
  roots.push(root);
  await mkdir(path.join(root, ".ccr/journal/main"), { recursive: true });
  const relativePath = ".ccr/journal/main/2026-07-29.md";
  await writeFile(
    path.join(root, relativePath),
    Buffer.concat([Buffer.from("a".repeat(20_000), "utf8"), Buffer.from([255])]),
  );

  await expect(readJournalEvidence(root, relativePath)).rejects.toThrow("valid UTF-8 text");
});

it("should preserve a concurrent human edit instead of refreshing stale journal content", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-journal-refresh-cas-"));
  roots.push(root);
  await mkdir(path.join(root, ".ccr/journal/main"), { recursive: true });
  const relativePath = ".ccr/journal/main/2026-07-29.md";
  const original =
    "# CCR Journal\n\n- **Started**: 2026-07-29T10:00:00Z\n- **Updated**: 2026-07-29T10:00:00Z\n";
  const humanEdit = `${original}\nHuman note added concurrently.\n`;
  await writeFile(path.join(root, relativePath), humanEdit, "utf8");

  await expect(
    refreshJournalEntry(
      root,
      { path: relativePath, content: original },
      new Date("2026-07-29T11:00:00Z"),
    ),
  ).rejects.toThrow("changed during update");
  await expect(readFile(path.join(root, relativePath), "utf8")).resolves.toBe(humanEdit);
});
