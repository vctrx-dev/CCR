import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * JSON artifact ownership for the managed-artifact lifecycle. A payload hash permits upgrading
 * untouched defaults without claiming user edits; schema-specific validation stays with callers.
 * Register new JSON artifacts with this policy rather than adding setup path-specific branches.
 */
export const MAX_MANAGED_JSON_CHARACTERS = 256_000;

const ownershipSchema = z
  .object({
    schemaVersion: z.literal(1),
    defaultSha256: z.string().regex(/^[0-9a-f]{64}$/u),
  })
  .strict();
const objectSchema = z.record(z.string(), z.unknown());

function payloadHash(data: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

/** Parses bounded JSON without retaining syntax-error input excerpts or exposing ownership metadata. */
export function parseManagedJsonArtifact(content: string): {
  data: Record<string, unknown>;
  defaultSha256?: string;
} {
  if (content.length > MAX_MANAGED_JSON_CHARACTERS) {
    throw new Error("CCR JSON artifact exceeded its safe character limit.");
  }
  let input: unknown;
  try {
    input = JSON.parse(content);
  } catch {
    throw new Error("CCR JSON artifact must be valid JSON.");
  }
  const parsed = objectSchema.safeParse(input);
  if (!parsed.success) throw new Error("CCR JSON artifact must be an object.");
  const { _ccr, ...data } = parsed.data;
  if (_ccr === undefined) return { data };
  const ownership = ownershipSchema.safeParse(_ccr);
  if (!ownership.success) throw new Error("CCR JSON ownership metadata is invalid.");
  return { data, defaultSha256: ownership.data.defaultSha256 };
}

/** Marks a default payload; `_ccr` is reserved and customized payloads must not be re-marked. */
export function serializeUpgradableJsonArtifact(input: unknown): string {
  const data = objectSchema.parse(input);
  if ("_ccr" in data) throw new Error("CCR JSON ownership key _ccr is reserved.");
  const content = `${JSON.stringify(
    {
      _ccr: { schemaVersion: 1, defaultSha256: payloadHash(data) },
      ...data,
    },
    null,
    2,
  )}\n`;
  if (content.length > MAX_MANAGED_JSON_CHARACTERS) {
    throw new Error("CCR JSON artifact exceeded its safe character limit.");
  }
  return content;
}

/** Grants upgrade ownership only when valid metadata still matches the complete default payload. */
export function isUnmodifiedJsonArtifact(content: string): boolean {
  try {
    const parsed = parseManagedJsonArtifact(content);
    return parsed.defaultSha256 !== undefined && payloadHash(parsed.data) === parsed.defaultSha256;
  } catch {
    return false;
  }
}
