import type { Command } from "commander";
import {
  listSafeRecentPaths,
  listSafeRepositoryPaths,
  readSafeRepositoryDiff,
  readSafeRepositoryFile,
  readSharedContextFile,
} from "../context/broker";
import { findRepositoryRoot } from "../context/git";
import {
  ensureJournalEntryForHead,
  ensureWorkingJournalEntry,
  readRecentJournalEntries,
} from "../context/journal";
import { readSafeStagedPaths } from "../context/privacy";
import { listSafeReviewChanges, readSafeReviewEvidence } from "../review/evidence";
import type { CliIo } from "./index";

/** Registers privacy-filtered evidence and local continuity inspection commands. */
export function registerContextInspectionCommands(context: Command, io: CliIo): void {
  const root = () => findRepositoryRoot(io.cwd);
  context.command("changes").action(async () => {
    const changes = await readSafeStagedPaths(root());
    io.write(
      `${JSON.stringify({
        allowedStagedPaths: changes.included,
        excludedPathCount: changes.excluded.length,
      })}\n`,
    );
  });
  context
    .command("files [prefix]")
    .description("List safe index roots or files below a prefix")
    .option("--after <path>", "continue a truncated listing after this cursor")
    .action(async (prefix: string | undefined, options: { after?: string }) => {
      io.write(`${JSON.stringify(await listSafeRepositoryPaths(root(), prefix, options.after))}\n`);
    });
  context
    .command("read <file>")
    .description("Read one approved file from Git's index")
    .action(async (file: string) => {
      io.write(await readSafeRepositoryFile(root(), file));
    });
  context
    .command("shared <file>")
    .description("Read one current shared context document")
    .action(async (file: string) => {
      io.write(await readSharedContextFile(root(), file));
    });
  context
    .command("diff <file>")
    .description("Read one approved staged diff")
    .action(async (file: string) => {
      io.write(await readSafeRepositoryDiff(root(), file));
    });
  context.command("recent").action(async () => {
    io.write(`${JSON.stringify(await listSafeRecentPaths(root()))}\n`);
  });
  context.command("journal").action(async () => {
    const result = await ensureWorkingJournalEntry(root());
    io.write(`Created ${result.path}\n`);
  });
  context.command("journals").action(async () => {
    io.write(`${JSON.stringify(await readRecentJournalEntries(root()))}\n`);
  });
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
    const changes = await listSafeReviewChanges(root());
    const hasWorkingChanges =
      changes.stagedPaths.length + changes.unstagedPaths.length + changes.untrackedPaths.length > 0;
    const journal = hasWorkingChanges
      ? await ensureWorkingJournalEntry(root())
      : await ensureJournalEntryForHead(root());
    io.write(`${JSON.stringify(journal)}\n`);
  });
}
