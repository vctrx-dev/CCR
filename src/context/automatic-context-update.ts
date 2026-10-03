import { z } from "zod";
import { buildAutomaticContextEvidencePacket } from "./automatic-context-evidence";
import {
  type ClaudeContextRunner,
  requireAutomaticJournalPath,
  runHeadlessClaudeContextUpdate,
} from "./automatic-context-runner";
export {
  type ClaudeContextRunner,
  type ClaudeContextRunnerOptions,
  resolveClaudeExecutable,
  runHeadlessClaudeContextUpdate,
} from "./automatic-context-runner";
import { assertDecisionDocumentAppend, readDecisionDocument } from "./decisions";
import {
  MANAGED_LIFECYCLE_LOCK_PATH,
  assertSafeManagedPath,
  deleteManagedTextIfUnchanged,
  fingerprintManagedTree,
  readBoundedUtf8TextIfExists,
  tryAcquireManagedLock,
  writeManagedText,
  writeManagedTextIfUnchanged,
} from "./files";
import { isCommitInHeadHistory } from "./git";
import {
  assertJournalContentWithinLimit,
  inspectJournalDocument,
  isCompletedCommitJournal,
  isValidJournalTimestamp,
  refreshJournalActivity,
} from "./journal-document";
import { readResolvedContextConfig } from "./privacy";
import { validateContext } from "./validate";

/**
 * Opt-in headless Claude boundary for post-commit continuity updates. The completion record is local
 * and commit-scoped so repeated hook execution cannot rerun a successful update.
 */

const STATE_PATH = ".ccr/private/auto-update.json";
const MAX_STATE_CHARACTERS = 10_000;
const commitSchema = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u);
const stateSchema = z.object({
  schemaVersion: z.literal(1),
  commits: z.array(commitSchema).max(100),
});

function changedUnauthorizedPath(
  before: Map<string, string>,
  after: Map<string, string>,
  allowedPaths: ReadonlySet<string>,
): string | undefined {
  for (const relativePath of new Set([...before.keys(), ...after.keys()])) {
    if (allowedPaths.has(relativePath)) continue;
    if (before.get(relativePath) !== after.get(relativePath)) return relativePath;
  }
  return undefined;
}

function decisionBoundaryError(): Error {
  return new Error("Automatic context update changed decisions outside the append-only boundary.");
}

async function readAutomaticDecisions(root: string): Promise<string> {
  try {
    return await readDecisionDocument(root);
  } catch {
    throw decisionBoundaryError();
  }
}

/**
 * Fingerprints CCR-owned files only. The update runs in the background while the developer keeps
 * editing source, so source edits are expected; Claude's tool allowlist already denies them.
 */
async function readUpdateFingerprints(root: string): Promise<Map<string, string>> {
  return fingerprintManagedTree(root, ".ccr");
}

async function validateAutomaticUpdate(
  root: string,
  commit: string,
  journalPath: string,
  expectedStarted: string,
): Promise<void> {
  let journal: AutomaticJournal;
  try {
    journal = await readAutomaticJournal(root, journalPath);
  } catch {
    throw new Error("Automatic context update did not complete its journal.");
  }
  if (!isCompletedCommitJournal(journal.content, commit, expectedStarted)) {
    throw new Error("Automatic context update did not complete its journal.");
  }
  const validation = await validateContext(root);
  if (!validation.isValid) throw new Error("Automatic context update left context invalid.");
}

interface AutomaticJournal {
  content: string;
  started: string;
}

async function readAutomaticJournal(root: string, journalPath: string): Promise<AutomaticJournal> {
  const journal = await readBoundedUtf8TextIfExists(
    await assertSafeManagedPath(root, journalPath),
    64_000,
  );
  const startedValues =
    journal === undefined ? [] : inspectJournalDocument(journal.content).startedValues;
  const started = startedValues[0];
  if (
    journal === undefined ||
    journal.isTruncated ||
    journal.isBinary ||
    startedValues.length !== 1 ||
    started === undefined ||
    !isValidJournalTimestamp(started)
  ) {
    throw new Error("Automatic context update journal is invalid.");
  }
  return { content: journal.content, started };
}

async function readCompletedCommits(root: string): Promise<string[]> {
  const content = await readBoundedUtf8TextIfExists(
    await assertSafeManagedPath(root, STATE_PATH),
    MAX_STATE_CHARACTERS,
  );
  if (content === undefined) return [];
  if (content.isTruncated || content.isBinary) {
    throw new Error("Automatic context update state is invalid.");
  }
  try {
    return stateSchema.parse(JSON.parse(content.content)).commits;
  } catch {
    throw new Error("Automatic context update state is invalid.");
  }
}

/** Later commits on top are fine; a commit dropped by reset or rewrite is no longer worth updating. */
function assertAutomaticUpdateHead(root: string, commit: string): void {
  if (!isCommitInHeadHistory(root, commit)) {
    throw new Error("Automatic context update commit is no longer in the branch history.");
  }
}

function automaticEvidencePacketPath(commit: string): string {
  return `.ccr/private/auto-update-evidence-${commit}.json`;
}

interface RetainedEvidencePacket {
  path: string;
  content: string;
}

async function removeRetainedEvidencePacket(
  root: string,
  packet: RetainedEvidencePacket,
): Promise<void> {
  const isDeleted = await deleteManagedTextIfUnchanged(root, packet.path, packet.content);
  if (!isDeleted) {
    const remaining = await readBoundedUtf8TextIfExists(
      await assertSafeManagedPath(root, packet.path),
      1,
    );
    if (remaining !== undefined) {
      throw new Error("Automatic context update could not remove its evidence packet.");
    }
  }
}

/** Runs one headless context update per commit and records completion only after Claude succeeds. */
export async function runAutomaticContextUpdate(
  root: string,
  commit: string,
  runner: ClaudeContextRunner | undefined,
  journalPath: string,
): Promise<{ status: "already-updated" | "in-progress" | "updated" }> {
  const parsedCommit = commitSchema.safeParse(commit);
  if (!parsedCommit.success) {
    throw new Error("Automatic context update requires a valid commit object ID.");
  }
  const validatedCommit = parsedCommit.data;
  const validatedJournalPath = requireAutomaticJournalPath(journalPath);
  const release = await tryAcquireManagedLock(root, MANAGED_LIFECYCLE_LOCK_PATH);
  if (release === undefined) return { status: "in-progress" };
  let evidencePacket: RetainedEvidencePacket | undefined;
  try {
    const completed = await readCompletedCommits(root);
    assertAutomaticUpdateHead(root, validatedCommit);
    if (completed.includes(validatedCommit)) return { status: "already-updated" };
    const journal = await readAutomaticJournal(root, validatedJournalPath);
    const assessmentMarker = `<!-- CCR context assessed: ${validatedCommit} -->`;
    if (journal.content.split(/\r?\n/u).includes(assessmentMarker)) {
      await validateAutomaticUpdate(root, validatedCommit, validatedJournalPath, journal.started);
      return { status: "already-updated" };
    }
    const expectedStarted = journal.started;
    const config = await readResolvedContextConfig(root);
    const decisionsBefore = config.instructions.updateDecisionsMd
      ? await readAutomaticDecisions(root)
      : undefined;
    const allowedPaths = new Set([validatedJournalPath, ".ccr/project.md"]);
    if (config.instructions.updateDecisionsMd) allowedPaths.add(".ccr/decisions.md");
    const before = await readUpdateFingerprints(root);
    const packetPath = automaticEvidencePacketPath(validatedCommit);
    const packetContent = await buildAutomaticContextEvidencePacket(root, validatedCommit);
    assertAutomaticUpdateHead(root, validatedCommit);
    evidencePacket = { path: packetPath, content: packetContent };
    await writeManagedText(root, packetPath, packetContent);
    try {
      await (runner ?? runHeadlessClaudeContextUpdate)(root, validatedJournalPath, {
        commit: validatedCommit,
        evidencePacketPath: packetPath,
        shouldUpdateDecisions: config.instructions.updateDecisionsMd,
      });
    } catch {
      throw new Error("Automatic context update failed.");
    }
    await removeRetainedEvidencePacket(root, evidencePacket);
    evidencePacket = undefined;
    assertAutomaticUpdateHead(root, validatedCommit);
    const unauthorized = changedUnauthorizedPath(
      before,
      await readUpdateFingerprints(root),
      allowedPaths,
    );
    if (unauthorized) {
      throw new Error(`Automatic context update changed an unauthorized path: ${unauthorized}.`);
    }
    if (decisionsBefore !== undefined) {
      try {
        assertDecisionDocumentAppend(decisionsBefore, await readAutomaticDecisions(root));
      } catch {
        throw decisionBoundaryError();
      }
    }
    await validateAutomaticUpdate(root, validatedCommit, validatedJournalPath, expectedStarted);
    // Narrative completion is not evidence that this context-assessment workflow succeeded.
    // Persist the receipt only after every postcondition, retaining it when bounded state is pruned.
    const assessedJournal = await readAutomaticJournal(root, validatedJournalPath);
    // The headless worker has no reliable clock, so CCR owns the activity timestamp.
    const refreshedJournal = refreshJournalActivity(
      assessedJournal.content,
      new Date(),
      validatedJournalPath,
    );
    const assessedContent = `${refreshedJournal.trimEnd()}\n\n${assessmentMarker}\n`;
    assertJournalContentWithinLimit(assessedContent, validatedJournalPath);
    if (
      !(await writeManagedTextIfUnchanged(
        root,
        validatedJournalPath,
        assessedJournal.content,
        assessedContent,
      ))
    ) {
      throw new Error("Journal changed before context assessment could be recorded.");
    }
    await writeManagedText(
      root,
      STATE_PATH,
      `${JSON.stringify({ schemaVersion: 1, commits: [...completed, validatedCommit].slice(-100) }, null, 2)}\n`,
    );
    return { status: "updated" };
  } finally {
    try {
      if (evidencePacket !== undefined) {
        await removeRetainedEvidencePacket(root, evidencePacket);
      }
    } finally {
      await release();
    }
  }
}
