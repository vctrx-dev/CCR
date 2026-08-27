import { z } from "zod";
import {
  assertSafeManagedPath,
  readBoundedUtf8TextIfExists,
  writeManagedTextIfUnchanged,
} from "./files";
import { hasControlCharacters, readResolvedContextConfig } from "./privacy";

/**
 * Decision-document policy and persistence boundary. Interactive writes and headless postcondition
 * checks share the same append format, size limit, duplicate handling, and text validation.
 */

export const DECISIONS_PATH = ".ccr/decisions.md";

const MAX_DECISION_CHARACTERS = 500;
const MAX_DECISIONS_DOCUMENT_CHARACTERS = 10_000;
const MAX_DECISION_APPEND_ATTEMPTS = 50;

const decisionSchema = z
  .string()
  .min(1)
  .max(MAX_DECISION_CHARACTERS)
  .refine((value) => !hasControlCharacters(value), "A decision must be one line of plain text.")
  .transform((value) => value.trim())
  .pipe(z.string().min(1, "A decision cannot be blank."));

/** Reads the complete decisions document through its bounded fatal-UTF-8 boundary. */
export async function readDecisionDocument(root: string): Promise<string> {
  const target = await assertSafeManagedPath(root, DECISIONS_PATH);
  const existing = await readBoundedUtf8TextIfExists(target, MAX_DECISIONS_DOCUMENT_CHARACTERS);
  if (existing === undefined) {
    throw new Error("Decisions document is missing. Run `ccr setup --apply` first.");
  }
  if (existing.isBinary) throw new Error("Decisions document is not valid UTF-8 text.");
  if (existing.isTruncated) {
    throw new Error(
      `Decisions document exceeds ${MAX_DECISIONS_DOCUMENT_CHARACTERS} characters; shorten it before appending.`,
    );
  }
  return existing.content;
}

/** Returns the canonical document after one validated append, or the original for a duplicate. */
export function appendDecisionToDocument(content: string, candidate: unknown): string {
  const decision = decisionSchema.parse(candidate);
  const entry = `- ${decision}`;
  if (content.split(/\r?\n/u).includes(entry)) return content;
  const separator = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
  const updated = `${content}${separator}${entry}\n`;
  if (updated.length > MAX_DECISIONS_DOCUMENT_CHARACTERS) {
    throw new Error(
      `Decision append would exceed ${MAX_DECISIONS_DOCUMENT_CHARACTERS} characters; shorten the document first.`,
    );
  }
  return updated;
}

/** Verifies that a headless edit is unchanged or exactly one canonical, nonduplicate append. */
export function assertDecisionDocumentAppend(previous: string, current: string): void {
  if (current === previous) return;
  const separator = previous.length > 0 && !previous.endsWith("\n") ? "\n" : "";
  const prefix = `${previous}${separator}`;
  if (!current.startsWith(prefix)) throw new Error("Decision document is not append-only.");
  const match = /^- ([^\r\n]+)\n$/u.exec(current.slice(prefix.length));
  const candidate = match?.[1];
  if (candidate === undefined) throw new Error("Decision append is not canonical.");
  const parsed = decisionSchema.safeParse(candidate);
  if (!parsed.success || parsed.data !== candidate) {
    throw new Error("Decision append is not canonical.");
  }
  if (appendDecisionToDocument(previous, candidate) !== current) {
    throw new Error("Decision append is duplicate or malformed.");
  }
}

/**
 * Appends one human-confirmed, bounded decision only when the committed opt-in is enabled.
 * The document must already be created by setup; this prevents an ad-hoc context write path.
 */
export async function appendDecision(root: string, candidate: unknown): Promise<void> {
  const decision = decisionSchema.parse(candidate);
  const config = await readResolvedContextConfig(root);
  if (!config.instructions.updateDecisionsMd) {
    throw new Error(
      "Decision updates are disabled because instructions.updateDecisionsMd is false.",
    );
  }
  for (let attempt = 0; attempt < MAX_DECISION_APPEND_ATTEMPTS; attempt += 1) {
    const existing = await readDecisionDocument(root);
    const updated = appendDecisionToDocument(existing, decision);
    if (updated === existing) return;
    if (await writeManagedTextIfUnchanged(root, DECISIONS_PATH, existing, updated)) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Decisions document remained busy or changed repeatedly; retry the append.");
}
