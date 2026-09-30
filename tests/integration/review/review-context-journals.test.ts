import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { DEFAULT_CONTEXT_CONFIG, serializeContextConfig } from "../../../src/context/config";
import {
  ensureJournalEntryForHead,
  ensurePullRequestJournalEntry,
  ensureWorkingJournalEntry,
  readRecentJournalEntriesExcludingActive,
} from "../../../src/context/journal";
import { computeReviewContextState } from "../../../src/review/review-state";
import { createTemporaryRootRegistry, runCommand } from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();

async function makeRepository(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-review-context-journals-"));
  roots.push(root);
  await runCommand("git", ["init", "--quiet", "-b", "main"], { cwd: root });
  await runCommand("git", ["config", "user.name", "CCR Test"], { cwd: root });
  await runCommand("git", ["config", "user.email", "ccr@example.test"], { cwd: root });
  await mkdir(path.join(root, ".ccr"), { recursive: true });
  await writeFile(
    path.join(root, ".ccr/config.json"),
    serializeContextConfig(DEFAULT_CONTEXT_CONFIG),
    "utf8",
  );
  await writeFile(path.join(root, ".ccr/project.md"), "# Project\n", "utf8");
  await writeFile(path.join(root, ".ccr/stakeholders.md"), "# Stakeholders\n", "utf8");
  await writeFile(path.join(root, ".ccr/decisions.md"), "", "utf8");
  await writeFile(path.join(root, "source.ts"), "export const value = 1;\n", "utf8");
  await runCommand("git", ["add", "--", ".ccr", "source.ts"], { cwd: root });
  await runCommand("git", ["commit", "--quiet", "-m", "test: seed"], { cwd: root });
  return root;
}

it("should track every journal input while keeping review freshness independent of journals", async () => {
  const root = await makeRepository();
  const prior = await ensureJournalEntryForHead(root, new Date("2026-08-25T01:00:00Z"));
  await writeFile(path.join(root, "source.ts"), "export const value = 2;\n", "utf8");
  await runCommand("git", ["add", "--", "source.ts"], { cwd: root });
  await runCommand("git", ["commit", "--quiet", "-m", "test: advance"], { cwd: root });
  await writeFile(path.join(root, "source.ts"), "export const value = 3;\n", "utf8");
  const active = await ensureWorkingJournalEntry(root, new Date("2026-08-26T01:00:00Z"));
  const initial = await computeReviewContextState(root);

  await writeFile(
    path.join(root, prior.path),
    `${await readFile(path.join(root, prior.path), "utf8")}Prior feedback.\n`,
    "utf8",
  );
  const afterPrior = await computeReviewContextState(root);
  expect(afterPrior.contextFingerprint).toBe(initial.contextFingerprint);
  expect(afterPrior.inputContextFingerprint).not.toBe(initial.inputContextFingerprint);

  await writeFile(
    path.join(root, active.path),
    `${await readFile(path.join(root, active.path), "utf8")}Current run.\n`,
    "utf8",
  );
  const afterActive = await computeReviewContextState(root);
  expect(afterActive.contextFingerprint).toBe(afterPrior.contextFingerprint);
  expect(afterActive.inputContextFingerprint).not.toBe(afterPrior.inputContextFingerprint);
});

it("should keep PR review freshness stable when other journals change", async () => {
  const root = await makeRepository();
  const journal = await ensurePullRequestJournalEntry(root, 42, new Date("2026-08-25T01:00:00Z"));
  const other = await ensurePullRequestJournalEntry(root, 43, new Date("2026-08-26T01:00:00Z"));
  const initial = await computeReviewContextState(root, 42);

  await writeFile(
    path.join(root, other.path),
    `${await readFile(path.join(root, other.path), "utf8")}Other continuity.\n`,
    "utf8",
  );

  const afterOther = await computeReviewContextState(root, 42);
  expect(afterOther.contextFingerprint).toBe(initial.contextFingerprint);
  expect(afterOther.inputContextFingerprint).not.toBe(initial.inputContextFingerprint);

  await writeFile(
    path.join(root, journal.path),
    `${await readFile(path.join(root, journal.path), "utf8")}Active PR feedback.\n`,
    "utf8",
  );
  const afterActive = await computeReviewContextState(root, 42);
  expect(afterActive.contextFingerprint).toBe(afterOther.contextFingerprint);
  expect(afterActive.inputContextFingerprint).not.toBe(afterOther.inputContextFingerprint);
});

it("should keep continuity stable when a new active journal displaces the configured recent entry", async () => {
  const root = await makeRepository();
  await writeFile(
    path.join(root, ".ccr/config.json"),
    serializeContextConfig({
      ...DEFAULT_CONTEXT_CONFIG,
      context: { ...DEFAULT_CONTEXT_CONFIG.context, recentJournalEntries: 1 },
    }),
    "utf8",
  );
  await ensureJournalEntryForHead(root, new Date("2026-08-25T01:00:00Z"));
  await writeFile(path.join(root, "source.ts"), "export const value = 2;\n", "utf8");
  await runCommand("git", ["add", "--", "source.ts"], { cwd: root });
  await runCommand("git", ["commit", "--quiet", "-m", "test: advance"], { cwd: root });
  const beforeActive = await computeReviewContextState(root);

  await ensureWorkingJournalEntry(root, new Date("2026-08-27T01:00:00Z"));
  const afterActive = await computeReviewContextState(root);

  expect(afterActive.contextFingerprint).toBe(beforeActive.contextFingerprint);
  expect(afterActive.inputContextFingerprint).not.toBe(beforeActive.inputContextFingerprint);
});

it("should target a not-yet-created working journal when HEAD already has continuity", async () => {
  const root = await makeRepository();
  await ensureJournalEntryForHead(root, new Date("2026-08-25T01:00:00Z"));
  await writeFile(path.join(root, "source.ts"), "export const value = 2;\n", "utf8");
  const beforeWorking = await computeReviewContextState(root);

  await ensureWorkingJournalEntry(root, new Date("2026-08-27T01:00:00Z"));
  const afterWorking = await computeReviewContextState(root);

  expect(afterWorking.contextFingerprint).toBe(beforeWorking.contextFingerprint);
  expect(afterWorking.inputContextFingerprint).not.toBe(beforeWorking.inputContextFingerprint);
});

it("should target HEAD rather than a stale working journal after changes are reverted", async () => {
  const root = await makeRepository();
  await writeFile(path.join(root, "source.ts"), "export const value = 2;\n", "utf8");
  const working = await ensureWorkingJournalEntry(root, new Date("2026-08-25T01:00:00Z"));
  await writeFile(path.join(root, "source.ts"), "export const value = 1;\n", "utf8");
  const head = await ensureJournalEntryForHead(root, new Date("2026-08-26T01:00:00Z"));
  const initial = await computeReviewContextState(root);

  await writeFile(
    path.join(root, working.path),
    `${await readFile(path.join(root, working.path), "utf8")}Stale working context.\n`,
    "utf8",
  );
  const afterWorking = await computeReviewContextState(root);
  expect(afterWorking.contextFingerprint).toBe(initial.contextFingerprint);
  expect(afterWorking.inputContextFingerprint).not.toBe(initial.inputContextFingerprint);

  await writeFile(
    path.join(root, head.path),
    `${await readFile(path.join(root, head.path), "utf8")}Active HEAD context.\n`,
    "utf8",
  );
  const afterHead = await computeReviewContextState(root);
  expect(afterHead.contextFingerprint).toBe(afterWorking.contextFingerprint);
  expect(afterHead.inputContextFingerprint).not.toBe(afterWorking.inputContextFingerprint);
});

it("should keep freshness bound to shared context and review-relevant settings only", async () => {
  const root = await makeRepository();
  const initial = await computeReviewContextState(root);

  await writeFile(
    path.join(root, ".ccr/config.json"),
    serializeContextConfig({
      ...DEFAULT_CONTEXT_CONFIG,
      hooks: { ...DEFAULT_CONTEXT_CONFIG.hooks, autoUpdateContext: true },
      context: { ...DEFAULT_CONTEXT_CONFIG.context, recentJournalEntries: 5 },
    }),
    "utf8",
  );
  const afterOperationalSettings = await computeReviewContextState(root);
  expect(afterOperationalSettings.contextFingerprint).toBe(initial.contextFingerprint);

  await writeFile(
    path.join(root, ".ccr/config.json"),
    serializeContextConfig({
      ...DEFAULT_CONTEXT_CONFIG,
      privacy: { excludedPaths: ["learner-records/**"] },
    }),
    "utf8",
  );
  const afterPrivacy = await computeReviewContextState(root);
  expect(afterPrivacy.contextFingerprint).not.toBe(initial.contextFingerprint);

  await writeFile(path.join(root, ".ccr/decisions.md"), "- Drafts stay human-reviewed.\n", "utf8");
  const afterDecision = await computeReviewContextState(root);
  expect(afterDecision.contextFingerprint).not.toBe(afterPrivacy.contextFingerprint);
});

it("should list recent journals without spending a slot on the active entry", async () => {
  const root = await makeRepository();
  const prior = await ensureJournalEntryForHead(root, new Date("2026-08-25T01:00:00Z"));
  await writeFile(path.join(root, "source.ts"), "export const value = 2;\n", "utf8");
  const active = await ensureWorkingJournalEntry(root, new Date("2026-08-27T01:00:00Z"));

  const recent = await readRecentJournalEntriesExcludingActive(root, { kind: "working" });

  expect(recent.map(({ path: entryPath }) => entryPath)).toEqual([prior.path]);
  expect(recent.map(({ path: entryPath }) => entryPath)).not.toContain(active.path);
});
