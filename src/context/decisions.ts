import { z } from "zod";
import { assertSafeManagedPath, readBoundedTextIfExists, writeManagedText } from "./files";
import { hasControlCharacters, readResolvedContextConfig } from "./privacy";

/**
 * Config-gated decision-writing boundary. Review and future context features must append through
 * this module so a human-owned opt-in, one-line input validation, safe path handling, and document
 * size limit remain consistent; extend this contract rather than writing `decisions.md` directly.
 */

export const DECISIONS_PATH = ".ccr/decisions.md";

const MAX_DECISION_CHARACTERS = 500;
const MAX_DECISIONS_DOCUMENT_CHARACTERS = 10_000;

const decisionSchema = z
  .string()
  .min(1)
  .max(MAX_DECISION_CHARACTERS)
  .refine((value) => !hasControlCharacters(value), "A decision must be one line of plain text.")
  .transform((value) => value.trim())
  .pipe(z.string().min(1, "A decision cannot be blank."));

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
  const existing = await readBoundedTextIfExists(
    await assertSafeManagedPath(root, DECISIONS_PATH),
    MAX_DECISIONS_DOCUMENT_CHARACTERS,
  );
  if (existing === undefined) {
    throw new Error("Decisions document is missing. Run `ccr setup --apply` first.");
  }
  if (existing.isTruncated) {
    throw new Error(
      `Decisions document exceeds ${MAX_DECISIONS_DOCUMENT_CHARACTERS} characters; shorten it before appending.`,
    );
  }
  const separator = existing.content.length > 0 && !existing.content.endsWith("\n") ? "\n" : "";
  const entry = `- ${decision}`;
  if (existing.content.split(/\r?\n/u).includes(entry)) return;
  const updated = `${existing.content}${separator}${entry}\n`;
  if (updated.length > MAX_DECISIONS_DOCUMENT_CHARACTERS) {
    throw new Error(
      `Decision append would exceed ${MAX_DECISIONS_DOCUMENT_CHARACTERS} characters; shorten the document first.`,
    );
  }
  await writeManagedText(root, DECISIONS_PATH, updated);
}
