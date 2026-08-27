import type { Command } from "commander";
import {
  listSafeCommitPaths,
  listSafeRecentPaths,
  listSafeRepositoryPaths,
  readSafeCommitFile,
  readSafeRepositoryDiff,
  readSafeRepositoryFile,
  readSharedContextFile,
} from "../context/broker";
import { appendDecision } from "../context/decisions";
import {
  ensureJournalEntryForHead,
  ensurePullRequestJournalEntry,
  ensureWorkingJournalEntry,
  parsePullRequestToken,
  readRecentJournalEntries,
} from "../context/journal";
import { readSafeStagedPaths } from "../context/privacy";
import { listSafeReviewChanges, readSafeReviewEvidence } from "../review/evidence";
import {
  readSafePullRequestEvidence,
  readSafePullRequestHeadEvidence,
} from "../review/pr-evidence";
import {
  computeReviewContextFingerprint,
  computeWorkingReviewState,
  recordWorkingReviewState,
} from "../review/review-state";
import type { CliIo } from "./index";
import { findCliRepositoryRoot } from "./io";

/** Registers privacy-filtered evidence, local continuity inspection, and opt-in decision commands. */
export function registerContextInspectionCommands(context: Command, io: CliIo): void {
  const root = () => findCliRepositoryRoot(io);
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
  context
    .command("commit-changes <commit>")
    .description("List privacy-approved regular paths changed by the current HEAD commit")
    .option("--after <path>", "continue a truncated listing after this cursor")
    .action(async (commit: string, options: { after?: string }) => {
      io.write(`${JSON.stringify(await listSafeCommitPaths(root(), commit, options.after))}\n`);
    });
  context
    .command("commit-read <commit> <file>")
    .description("Read one bounded immutable blob changed by the current HEAD commit")
    .action(async (commit: string, file: string) => {
      io.write(await readSafeCommitFile(root(), commit, file));
    });
  context.command("journal").action(async () => {
    const result = await ensureWorkingJournalEntry(root());
    io.write(`Created ${result.path}\n`);
  });
  context
    .command("journals [pull-request]")
    .description("Read configured recent journals for this branch or PR-<number>")
    .action(async (pullRequest: string | undefined) => {
      io.write(
        `${JSON.stringify(
          await readRecentJournalEntries(
            root(),
            pullRequest === undefined ? undefined : parsePullRequestToken(pullRequest),
          ),
        )}\n`,
      );
    });
  context.command("review-changes").action(async () => {
    io.write(`${JSON.stringify(await listSafeReviewChanges(root()))}\n`);
  });
  context
    .command("review-state")
    .description("Fingerprint the current privacy-approved review evidence")
    .action(async () => {
      io.write(`${JSON.stringify(await computeWorkingReviewState(root()))}\n`);
    });
  context
    .command("review-context-state [pull-request]")
    .description("Fingerprint bounded shared context and recent branch or PR journals")
    .action(async (pullRequest: string | undefined) => {
      io.write(
        `${JSON.stringify({
          contextFingerprint: await computeReviewContextFingerprint(
            root(),
            pullRequest === undefined ? undefined : parsePullRequestToken(pullRequest),
          ),
        })}\n`,
      );
    });
  context
    .command("record-review-state <journal> <fingerprint> <context-fingerprint>")
    .description("Verify and record code and context fingerprints in the latest journal review run")
    .action(async (journal: string, fingerprint: string, contextFingerprint: string) => {
      await recordWorkingReviewState(root(), journal, fingerprint, contextFingerprint);
      io.write("Review state recorded.\n");
    });
  context
    .command("review-diff <file>")
    .description("Read privacy-filtered staged, unstaged, or untracked evidence")
    .action(async (file: string) => {
      io.write(await readSafeReviewEvidence(root(), file));
    });
  context
    .command("review-pr <pull-request>")
    .description("Read one bounded, privacy-filtered PR evidence packet")
    .action(async (pullRequest: string) => {
      io.write(
        `${JSON.stringify(
          await readSafePullRequestEvidence(root(), parsePullRequestToken(pullRequest)),
        )}\n`,
      );
    });
  context
    .command("review-pr-head <pull-request> <files...>")
    .description("Read bounded head content for up to eight approved PR paths")
    .action(async (pullRequest: string, files: string[]) => {
      io.write(
        `${JSON.stringify(
          await readSafePullRequestHeadEvidence(root(), parsePullRequestToken(pullRequest), files),
        )}\n`,
      );
    });
  context
    .command("review-journal [pull-request]")
    .description("Reuse one journal for the current change, commit, or PR-<number>")
    .action(async (pullRequest: string | undefined) => {
      if (pullRequest !== undefined) {
        const journal = await ensurePullRequestJournalEntry(
          root(),
          parsePullRequestToken(pullRequest),
        );
        io.write(`${JSON.stringify(journal)}\n`);
        return;
      }
      const changes = await listSafeReviewChanges(root());
      const hasWorkingChanges =
        changes.stagedPaths.length + changes.unstagedPaths.length + changes.untrackedPaths.length >
        0;
      const journal = hasWorkingChanges
        ? await ensureWorkingJournalEntry(root())
        : await ensureJournalEntryForHead(root());
      io.write(`${JSON.stringify(journal)}\n`);
    });
  context
    .command("append-decision <decision>")
    .description("Append one opt-in, human-confirmed decision")
    .action(async (decision: string) => {
      await appendDecision(root(), decision);
      io.write("Decision recorded.\n");
    });
}
