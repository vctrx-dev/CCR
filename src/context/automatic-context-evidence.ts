import { type SafePathList, listSafeCommitPaths, readSafeCommitFile } from "./broker";

/**
 * Bounded immutable evidence assembly for headless continuity updates. Extend the broker rather
 * than this module when repository privacy or blob-approval semantics change.
 */

const MAX_PACKET_PATHS = 200;
const MAX_RETAINED_CHARACTERS = 200_000;
const MAX_PACKET_BYTES = 512_000;

export interface AutomaticContextEvidenceBroker {
  listPaths(root: string, commit: string, after?: string): Promise<SafePathList>;
  readFile(root: string, commit: string, file: string): Promise<string>;
}

const DEFAULT_EVIDENCE_BROKER: AutomaticContextEvidenceBroker = {
  listPaths: listSafeCommitPaths,
  readFile: readSafeCommitFile,
};

async function readAllApprovedPaths(
  root: string,
  commit: string,
  broker: AutomaticContextEvidenceBroker,
): Promise<{ paths: string[]; excludedPathCount: number }> {
  const paths: string[] = [];
  const seenPaths = new Set<string>();
  let cursor: string | undefined;
  let excludedPathCount: number | undefined;
  for (;;) {
    const page = await broker.listPaths(root, commit, cursor);
    if (excludedPathCount !== undefined && page.excludedCount !== excludedPathCount) {
      throw new Error("Automatic context evidence changed during pagination.");
    }
    excludedPathCount ??= page.excludedCount;
    for (const candidate of page.paths) {
      if (seenPaths.has(candidate)) {
        throw new Error("Automatic context evidence pagination repeated a path.");
      }
      seenPaths.add(candidate);
      paths.push(candidate);
      if (paths.length > MAX_PACKET_PATHS) {
        throw new Error("Automatic context evidence exceeds its path limit.");
      }
    }
    if (page.omittedCount === 0) {
      if (page.nextCursor !== undefined) {
        throw new Error("Automatic context evidence pagination is invalid.");
      }
      break;
    }
    if (page.nextCursor === undefined || page.nextCursor === cursor) {
      throw new Error("Automatic context evidence pagination is incomplete.");
    }
    cursor = page.nextCursor;
  }
  return { paths, excludedPathCount: excludedPathCount ?? 0 };
}

/** Builds one bounded JSON packet from privacy-approved blobs belonging to the exact current HEAD. */
export async function buildAutomaticContextEvidencePacket(
  root: string,
  commit: string,
  broker: AutomaticContextEvidenceBroker = DEFAULT_EVIDENCE_BROKER,
): Promise<string> {
  const inventory = await readAllApprovedPaths(root, commit, broker);
  const files: Array<{ path: string; content: string }> = [];
  let retainedCharacters = 0;
  for (const approvedPath of inventory.paths) {
    const content = await broker.readFile(root, commit, approvedPath);
    retainedCharacters += approvedPath.length + content.length;
    if (retainedCharacters > MAX_RETAINED_CHARACTERS) {
      throw new Error("Automatic context evidence exceeds its content limit.");
    }
    files.push({ path: approvedPath, content });
  }
  const packet = `${JSON.stringify(
    {
      schemaVersion: 1,
      commit,
      excludedPathCount: inventory.excludedPathCount,
      files,
    },
    null,
    2,
  )}\n`;
  if (Buffer.byteLength(packet, "utf8") > MAX_PACKET_BYTES) {
    throw new Error("Automatic context evidence exceeds its content limit.");
  }
  return packet;
}
