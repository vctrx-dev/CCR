import { type SafePathList, createSafeCommitEvidenceReader } from "./broker";

/**
 * Bounded immutable evidence assembly for headless continuity updates. Extend the broker rather
 * than this module when repository privacy or blob-approval semantics change.
 */

const MAX_PACKET_PATHS = 200;
const MAX_RETAINED_CHARACTERS = 200_000;
const MAX_PACKET_BYTES = 512_000;

/**
 * Evidence source for one commit. `readDiff` is optional so adapters without parent access still
 * work; when present, each file's diff shares the retained-content budget with its full content.
 */
export interface AutomaticContextEvidenceBroker {
  listPaths(root: string, commit: string, after?: string): Promise<SafePathList>;
  readFile(root: string, commit: string, file: string): Promise<string>;
  readDiff?(root: string, commit: string, file: string): Promise<string>;
}

async function createDefaultEvidenceBroker(
  root: string,
  commit: string,
): Promise<AutomaticContextEvidenceBroker> {
  // The background update may start after later commits; the commit only has to stay in history.
  const snapshot = await createSafeCommitEvidenceReader(root, commit, { scope: "history" });
  return {
    listPaths: (_root, _commit, after) => snapshot.listPaths(after),
    readFile: (_root, _commit, file) => snapshot.readFile(file),
    readDiff: (_root, _commit, file) => snapshot.readDiff(file),
  };
}

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

/** Builds one bounded JSON packet from privacy-approved blobs of a commit in the current history. */
export async function buildAutomaticContextEvidencePacket(
  root: string,
  commit: string,
  broker?: AutomaticContextEvidenceBroker,
): Promise<string> {
  const scopedBroker = broker ?? (await createDefaultEvidenceBroker(root, commit));
  const inventory = await readAllApprovedPaths(root, commit, scopedBroker);
  const files: Array<{ path: string; content: string; diff?: string }> = [];
  let retainedCharacters = 0;
  for (const approvedPath of inventory.paths) {
    const content = await scopedBroker.readFile(root, commit, approvedPath);
    const diff = await scopedBroker.readDiff?.(root, commit, approvedPath);
    retainedCharacters += approvedPath.length + content.length + (diff?.length ?? 0);
    if (retainedCharacters > MAX_RETAINED_CHARACTERS) {
      throw new Error("Automatic context evidence exceeds its content limit.");
    }
    files.push(
      diff === undefined ? { path: approvedPath, content } : { path: approvedPath, content, diff },
    );
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
