import type { Command } from "commander";
import { findRepositoryRoot } from "../context/git";
import { ensureJournalEntryForHead } from "../context/journal";
import { listSafeReviewChanges, readSafeReviewEvidence } from "../review/evidence";
import type { CliIo } from "./index";

/** Registers deterministic privacy and continuity boundaries consumed by review skills. */
export function registerReviewContextCommands(context: Command, io: CliIo): void {
  const root = () => findRepositoryRoot(io.cwd);
  context.command("review-changes").action(async () => {
    io.write(`${JSON.stringify(await listSafeReviewChanges(root()))}\n`);
  });
  context
    .command("review-diff <file>")
    .description("Read privacy-filtered staged, unstaged, or untracked evidence")
    .action(async (file: string) => {
      io.write(await readSafeReviewEvidence(root(), file));
    });
  context.command("review-journal").action(async () => {
    io.write(`${JSON.stringify(await ensureJournalEntryForHead(root()))}\n`);
  });
}
