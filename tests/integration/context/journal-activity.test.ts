import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { branchDetails, ensureWorkingJournalEntry } from "../../../src/context/journal";
import { createTemporaryRootRegistry, runCommand } from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();

async function createJournalFixture(prefix: string, content: string, filename: string) {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  roots.push(root);
  await runCommand("git", ["init", "--quiet", "-b", "main"], { cwd: root });
  const relativePath = `.ccr/journal/${branchDetails(root).directory}/${filename}`;
  await mkdir(path.dirname(path.join(root, relativePath)), { recursive: true });
  await writeFile(path.join(root, relativePath), content, "utf8");
  return { root, relativePath };
}

it("should migrate only legacy header activity when reusing a working journal", async () => {
  const { root, relativePath } = await createJournalFixture(
    "ccr-legacy-journal-",
    "# CCR Journal\n\n- **Timestamp**: 2026-07-28T09:00:00Z\n- **Base commit**: `unborn`\n\n## Summary\n\nExample only:\n- **Updated**: 2026-07-29T09:00:00Z\n",
    "2026-07-28T09-00-00Z.md",
  );

  const reused = await ensureWorkingJournalEntry(root, new Date("2026-07-30T10:00:00Z"));
  const content = await readFile(path.join(root, relativePath), "utf8");

  expect(reused.path).toBe(relativePath);
  expect(content).toContain("**Started**: 2026-07-28T09:00:00Z");
  expect(content).toContain("**Updated**: 2026-07-30T10:00:00Z");
  expect(content).toContain("Example only:\n- **Updated**: 2026-07-29T09:00:00Z");
  expect(content).not.toContain("**Timestamp**");
});

it("should reject duplicate header activity instead of partially refreshing it", async () => {
  const { root, relativePath } = await createJournalFixture(
    "ccr-duplicate-journal-activity-",
    "# CCR Journal\n\n- **Started**: 2026-07-28T09:00:00Z\n- **Updated**: 2026-07-28T09:00:00Z\n- **Updated**: 2026-07-29T09:00:00Z\n- **Base commit**: `unborn`\n\n## Summary\n\nIncomplete.\n",
    "2026-07-28.md",
  );

  await expect(ensureWorkingJournalEntry(root, new Date("2026-07-30T10:00:00Z"))).rejects.toThrow(
    "Journal timestamp metadata is malformed",
  );
  expect(await readFile(path.join(root, relativePath), "utf8")).toContain(
    "- **Updated**: 2026-07-28T09:00:00Z\n- **Updated**: 2026-07-29T09:00:00Z",
  );
});
