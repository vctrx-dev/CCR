import { beforeEach, expect, it, vi } from "vitest";

const allocation = vi.hoisted(() => ({ createCount: 0, isFull: false }));

function directoryEntry(name: string) {
  return {
    isDirectory: () => true,
    isFile: () => false,
    isSymbolicLink: () => false,
    name,
  };
}

function fileEntry(name: string) {
  return {
    isDirectory: () => false,
    isFile: () => true,
    isSymbolicLink: () => false,
    name,
  };
}

vi.mock("../../../src/context/files", () => ({
  assertSafeManagedPath: async (_root: string, relativePath: string) => relativePath,
  createManagedTextExclusive: async () => {
    allocation.createCount += 1;
    return false;
  },
  readBoundedManagedDirectory: async (_root: string, relativeDirectory: string) => {
    if (!allocation.isFull) return [];
    if (relativeDirectory === ".ccr/journal") return [directoryEntry("main")];
    return Array.from({ length: 9_999 }, (_, index) => fileEntry(`2026-08-27.${index}.md`));
  },
}));

import { createJournalFile } from "../../../src/context/journal-entry";

beforeEach(() => {
  allocation.createCount = 0;
  allocation.isFull = false;
});

it("should refuse to create a journal that would exceed the readable tree bound", async () => {
  allocation.isFull = true;

  await expect(
    createJournalFile("repository", new Date("2026-08-27T01:00:00Z"), "main"),
  ).rejects.toThrow("Journal tree cannot exceed 10000 entries");
  expect(allocation.createCount).toBe(0);
});

it("should bound collision attempts when every candidate already exists", async () => {
  await expect(
    createJournalFile("repository", new Date("2026-08-27T01:00:00Z"), "main"),
  ).rejects.toThrow("Journal filename allocation exceeds 10000 attempts");
  expect(allocation.createCount).toBe(10_000);
});
