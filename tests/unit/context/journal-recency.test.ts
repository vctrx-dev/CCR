import { beforeEach, expect, it, vi } from "vitest";

const journalReads = vi.hoisted(() => new Map<string, number>());
const changes = vi.hoisted(() => ({ shouldPromote: true }));
const selectedPath = ".ccr/journal/a/2026-08-27.md";
const promotedPath = ".ccr/journal/b/2026-08-26.md";

function journal(updated: string): string {
  return `# CCR Journal\n\n- **Started**: 2026-08-20T01:00:00Z\n- **Updated**: ${updated}\n- **Base commit**: \`unborn\`\n\n## Summary\n\nCompleted.\n`;
}

vi.mock("../../../src/context/journal-entry", () => ({
  formatJournalEvidence: (content: string) => content,
  readCompleteJournalEntry: async (_root: string, relativePath: string) => {
    const readCount = (journalReads.get(relativePath) ?? 0) + 1;
    journalReads.set(relativePath, readCount);
    if (relativePath === promotedPath) {
      if (!changes.shouldPromote) {
        const content = journal("2026-08-27T04:00:00Z");
        return readCount === 1 ? content : content.replace("Completed", "Corrected");
      }
      return journal(readCount === 1 ? "2026-08-27T04:00:00Z" : "2026-08-27T06:00:00Z");
    }
    return journal("2026-08-27T05:00:00Z");
  },
  readJournalPaths: async () => [selectedPath, promotedPath],
}));

vi.mock("../../../src/context/journal-lock", () => ({
  withJournalMutationLock: async (_root: string, operation: () => Promise<unknown>) => operation(),
}));

vi.mock("../../../src/context/privacy", () => ({
  readResolvedContextConfig: async () => ({ context: { recentJournalEntries: 1 } }),
}));

import { readRecentJournalEntries } from "../../../src/context/journal-recency";

beforeEach(() => {
  journalReads.clear();
  changes.shouldPromote = true;
});

it("should reject same-length unselected journal edits even when activity and file revisions are unchanged", async () => {
  changes.shouldPromote = false;
  await expect(readRecentJournalEntries("repository")).rejects.toThrow(
    "Journal set changed during recency selection",
  );
});

it("should reject an unselected journal promoted during recency selection", async () => {
  await expect(readRecentJournalEntries("repository")).rejects.toThrow(
    "Journal set changed during recency selection",
  );
});
