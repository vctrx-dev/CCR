import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { DEFAULT_CONTEXT_CONFIG, serializeContextConfig } from "../../../src/context/config";
import {
  ensureJournalEntryForHead,
  ensurePullRequestJournalEntry,
  ensureWorkingJournalEntry,
} from "../../../src/context/journal";
import { computeReviewContextFingerprint } from "../../../src/review/review-state";
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

it("should fingerprint prior branch journals but exclude the active continuity target", async () => {
  const root = await makeRepository();
  const prior = await ensureJournalEntryForHead(root, new Date("2026-08-25T01:00:00Z"));
  await writeFile(path.join(root, "source.ts"), "export const value = 2;\n", "utf8");
  await runCommand("git", ["add", "--", "source.ts"], { cwd: root });
  await runCommand("git", ["commit", "--quiet", "-m", "test: advance"], { cwd: root });
  const active = await ensureWorkingJournalEntry(root, new Date("2026-08-26T01:00:00Z"));
  const initial = await computeReviewContextFingerprint(root);

  await writeFile(
    path.join(root, prior.path),
    `${await readFile(path.join(root, prior.path), "utf8")}Prior feedback.\n`,
    "utf8",
  );
  expect(await computeReviewContextFingerprint(root)).not.toBe(initial);

  const afterPrior = await computeReviewContextFingerprint(root);
  await writeFile(
    path.join(root, active.path),
    `${await readFile(path.join(root, active.path), "utf8")}Current run.\n`,
    "utf8",
  );
  expect(await computeReviewContextFingerprint(root)).toBe(afterPrior);
});

it("should fingerprint recent journals for the selected pull request", async () => {
  const root = await makeRepository();
  const journal = await ensurePullRequestJournalEntry(root, 42, new Date("2026-08-25T01:00:00Z"));
  const initial = await computeReviewContextFingerprint(root, 42);

  await writeFile(
    path.join(root, journal.path),
    `${await readFile(path.join(root, journal.path), "utf8")}Human feedback.\n`,
    "utf8",
  );

  expect(await computeReviewContextFingerprint(root, 42)).not.toBe(initial);
});
