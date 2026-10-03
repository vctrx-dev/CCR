import type { Command } from "commander";
import { computeContextAssessmentState, recordContextAssessment } from "../context/assessment";
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
  type ReviewJournalTarget,
  ensureJournalEntryForHead,
  ensurePullRequestJournalEntry,
  ensureWorkingJournalEntry,
  parsePullRequestToken,
  readRecentJournalEntriesExcludingActive,
} from "../context/journal";
import { readSafeStagedPaths } from "../context/privacy";
import { readReviewDimensionRegistry } from "../review/dimension-file";
import { parseReviewDimensionSelection, renderReviewDimensionSections } from "../review/dimensions";
import {
  hasSafeReviewChanges,
  listSafeReviewChanges,
  readSafeReviewEvidence,
} from "../review/evidence";
import {
  readSafePullRequestEvidence,
  readSafePullRequestHeadEvidence,
} from "../review/pr-evidence";
import { saveReview } from "../review/review-save";
import {
  computeReviewContextState,
  continueWorkingReviewState,
  recordWorkingReviewState,
} from "../review/review-state";
import type { CliIo } from "./index";
import { findCliRepositoryRoot } from "./io";

/** Registers privacy-filtered evidence, local continuity inspection, and opt-in decision commands. */
export function registerContextInspectionCommands(context: Command, io: CliIo): void {
  const root = () => findCliRepositoryRoot(io);
  context
    .command("dimensions")
    .description(
      "Render review lenses from current repository JSON, or packaged defaults when absent",
    )
    .option("--json", "return the validated effective taxonomy instead of rendered prompt sections")
    .option(
      "--select <dimensions>",
      "validate all or comma-separated IDs and render only those lenses",
    )
    .action(async (options: { json?: boolean; select?: string }) => {
      const registry = await readReviewDimensionRegistry(root());
      const selection =
        options.select === undefined
          ? undefined
          : parseReviewDimensionSelection(options.select, registry);
      const selected =
        selection === undefined || selection === "all"
          ? registry
          : {
              dimensions: registry.dimensions.filter(({ id }) => selection.split(",").includes(id)),
            };
      io.write(
        options.json
          ? `${JSON.stringify(selected, null, 2)}\n`
          : `${renderReviewDimensionSections(selected) || "No review dimensions are configured."}\n`,
      );
    });
  context
    .command("assess <code-fingerprint> <context-fingerprint> <summary>")
    .description("Record a completed context assessment against unchanged evidence")
    .option("--commit <commit>", "assess the exact current HEAD commit rather than working changes")
    .action(
      async (
        codeFingerprint: string,
        contextFingerprint: string,
        summary: string,
        options: { commit?: string },
      ) => {
        await recordContextAssessment(root(), {
          codeFingerprint,
          contextFingerprint,
          summary,
          commit: options.commit,
        });
        io.write("Context assessment recorded.\n");
      },
    );
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
    .description(
      "Read repository-wide recent journals except the active entry; PR-<number> names that entry",
    )
    .action(async (pullRequest: string | undefined) => {
      const target: ReviewJournalTarget =
        pullRequest === undefined
          ? { kind: hasSafeReviewChanges(await listSafeReviewChanges(root())) ? "working" : "head" }
          : { kind: "pull-request", pullRequest: parsePullRequestToken(pullRequest) };
      io.write(
        `${JSON.stringify(await readRecentJournalEntriesExcludingActive(root(), target))}\n`,
      );
    });
  context.command("review-changes").action(async () => {
    io.write(`${JSON.stringify(await listSafeReviewChanges(root()))}\n`);
  });
  context
    .command("review-state")
    .description("Fingerprint current code, review inputs, and continuity context")
    .option("--commit <commit>", "fingerprint the exact current HEAD commit for context assessment")
    .action(async (options: { commit?: string }) => {
      io.write(`${JSON.stringify(await computeContextAssessmentState(root(), options.commit))}\n`);
    });
  context
    .command("review-context-state [pull-request]")
    .description("Fingerprint review inputs and continuity-safe context")
    .action(async (pullRequest: string | undefined) => {
      io.write(
        `${JSON.stringify(
          await computeReviewContextState(
            root(),
            pullRequest === undefined ? undefined : parsePullRequestToken(pullRequest),
          ),
        )}\n`,
      );
    });
  context
    .command("record-review-state <journal> <fingerprint> <context-fingerprint>")
    .description(
      "Record fingerprints in the latest journal review run; re-recording requires unchanged code",
    )
    .option(
      "--continue-from <journal>",
      "continue a recorded current-HEAD review after context-only edits",
    )
    .action(
      async (
        journal: string,
        fingerprint: string,
        contextFingerprint: string,
        options: { continueFrom?: string },
      ) => {
        if (options.continueFrom === undefined) {
          await recordWorkingReviewState(root(), journal, fingerprint, contextFingerprint);
        } else {
          await continueWorkingReviewState(root(), journal, options.continueFrom, {
            fingerprint,
            contextFingerprint,
          });
        }
        io.write("Review state recorded.\n");
      },
    );
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
      const journal = hasSafeReviewChanges(changes)
        ? await ensureWorkingJournalEntry(root())
        : await ensureJournalEntryForHead(root());
      io.write(`${JSON.stringify(journal)}\n`);
    });
  context
    .command("save-review <scope> <dimensions> <counts> <summary>")
    .description("Save a finished review to its journal; counts are critical,high,medium,low")
    .option("--expected-state <fingerprint>", "code fingerprint captured before the review")
    .option("--expected-context <fingerprint>", "context fingerprint captured before the review")
    .option(
      "--expected-input-context <fingerprint>",
      "acknowledged input hash, checked before this save's journal writes",
    )
    .action(
      async (
        scope: string,
        dimensions: string,
        counts: string,
        summary: string,
        options: {
          expectedState?: string;
          expectedContext?: string;
          expectedInputContext?: string;
        },
      ) => {
        const saved = await saveReview(root(), { scope, dimensions, counts, summary, ...options });
        io.write(`Review saved to ${saved.path}.
`);
      },
    );
  context
    .command("append-decision <decision>")
    .description("Append one opt-in, human-confirmed decision")
    .action(async (decision: string) => {
      await appendDecision(root(), decision);
      io.write("Decision recorded.\n");
    });
}
