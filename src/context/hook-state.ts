import path from "node:path";
import { z } from "zod";
import { assertSafeManagedPath, readBoundedTextIfExists } from "./files";

/**
 * Deterministic validation boundary for repository-native hook provenance. Extend this schema and
 * the hook skill together; existence alone never establishes ownership or restoration authority.
 */

const HOOK_EVENTS = ["pre-commit", "post-commit"] as const;
const HOOK_STRATEGIES = ["repository-framework", "existing-native", "minimal-posix"] as const;
const MAX_HOOK_STATE_CHARACTERS = 65_536;

const relativePathSchema = z
  .string()
  .min(1)
  .max(500)
  .refine((value) => {
    const normalized = value.replaceAll("\\", "/");
    return (
      !path.posix.isAbsolute(normalized) &&
      !/^[A-Za-z]:/.test(normalized) &&
      !normalized.split("/").includes("..") &&
      ![...normalized].some((character) => character.charCodeAt(0) <= 31)
    );
  }, "must be a safe repository-relative path");

const hookArtifactSchema = z
  .object({
    events: z.array(z.enum(HOOK_EVENTS)).min(1).max(2),
    path: relativePathSchema,
    existed: z.boolean(),
    originalByteLength: z.number().int().nonnegative(),
    originalSha256: z.string().regex(/^[a-f0-9]{64}$/),
    separatorByteCount: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  })
  .strict()
  .superRefine((artifact, context) => {
    if (new Set(artifact.events).size !== artifact.events.length) {
      context.addIssue({ code: "custom", message: "artifact events must be unique" });
    }
  });

const hookStateSchema = z
  .object({
    schemaVersion: z.literal(1),
    strategy: z.enum(HOOK_STRATEGIES),
    strategyDescription: z.string().trim().min(1).max(500),
    frameworkSourcePath: relativePathSchema.nullable(),
    ccrEntryId: z.string().trim().min(1).max(200).nullable(),
    artifacts: z.array(hookArtifactSchema).min(1).max(3),
  })
  .strict()
  .superRefine((state, context) => {
    const events = state.artifacts.flatMap((artifact) => artifact.events);
    for (const event of HOOK_EVENTS) {
      if (events.filter((candidate) => candidate === event).length !== 1) {
        context.addIssue({
          code: "custom",
          message: `provenance must cover ${event} exactly once`,
          path: ["artifacts"],
        });
      }
    }
    const isFramework = state.strategy === "repository-framework";
    if (isFramework !== (state.frameworkSourcePath !== null && state.ccrEntryId !== null)) {
      context.addIssue({
        code: "custom",
        message: "framework strategy requires both frameworkSourcePath and ccrEntryId",
      });
    }
  });

export type HookState = z.infer<typeof hookStateSchema>;
export type HookStateResult =
  | { status: "missing" }
  | { issue: string; status: "invalid" }
  | { state: HookState; status: "valid" };

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "unknown schema error";
  const location = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
  return `${location}${issue.message}`;
}

/** Reads local hook provenance without treating malformed or unsafe state as managed ownership. */
export async function readHookState(root: string): Promise<HookStateResult> {
  let stateFile:
    | {
        content: string;
        isTruncated: boolean;
      }
    | undefined;
  try {
    stateFile = await readBoundedTextIfExists(
      await assertSafeManagedPath(root, ".ccr/private/hooks-state.json"),
      MAX_HOOK_STATE_CHARACTERS,
    );
  } catch (error: unknown) {
    return {
      issue: error instanceof Error ? error.message : "state read failed",
      status: "invalid",
    };
  }
  if (stateFile === undefined) return { status: "missing" };
  if (stateFile.isTruncated) {
    return {
      issue: `state exceeds the ${MAX_HOOK_STATE_CHARACTERS}-character limit`,
      status: "invalid",
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stateFile.content);
  } catch {
    return { issue: "state is not valid JSON", status: "invalid" };
  }
  const result = hookStateSchema.safeParse(parsed);
  return result.success
    ? { state: result.data, status: "valid" }
    : { issue: firstIssue(result.error), status: "invalid" };
}
