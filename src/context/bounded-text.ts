import type { FileHandle } from "node:fs/promises";
import { open, readFile } from "node:fs/promises";
import { TextDecoder } from "node:util";

const MAX_UTF8_BYTES_PER_UTF16_CODE_UNIT = 3;
const UTF8_BOUNDARY_BYTES = 4;

export interface BoundedText {
  content: string;
  isTruncated: boolean;
}

export interface BoundedUtf8Text extends BoundedText {
  isBinary: boolean;
}

interface BoundedBytes {
  buffer: Buffer;
  isTruncated: boolean;
}

/** Returns whether a filesystem error represents an absent path. */
export function isFileNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/** Reads optional UTF-8 text without hiding errors other than a missing file. */
export async function readTextIfExists(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error: unknown) {
    if (isFileNotFound(error)) return undefined;
    throw error;
  }
}

function boundedReadByteLimit(maxCharacters: number): number {
  const maxSafeCharacters = Math.floor(
    (Number.MAX_SAFE_INTEGER - UTF8_BOUNDARY_BYTES) / MAX_UTF8_BYTES_PER_UTF16_CODE_UNIT,
  );
  if (
    !Number.isSafeInteger(maxCharacters) ||
    maxCharacters < 1 ||
    maxCharacters > maxSafeCharacters
  ) {
    throw new Error("Bounded text reads require a positive safe character limit.");
  }
  return maxCharacters * MAX_UTF8_BYTES_PER_UTF16_CODE_UNIT + UTF8_BOUNDARY_BYTES;
}

async function readBoundedBytesIfExists(
  filePath: string,
  maxCharacters: number,
): Promise<BoundedBytes | undefined> {
  const byteLimit = boundedReadByteLimit(maxCharacters);
  let handle: FileHandle;
  try {
    handle = await open(filePath, "r");
  } catch (error: unknown) {
    if (isFileNotFound(error)) return undefined;
    throw error;
  }
  try {
    const before = await handle.stat();
    const bytesToRead = Math.min(before.size, byteLimit);
    if (bytesToRead === 0) {
      const after = await handle.stat();
      return { buffer: Buffer.alloc(0), isTruncated: after.size > 0 };
    }
    const buffer = Buffer.alloc(bytesToRead);
    const { bytesRead } = await handle.read(buffer, 0, bytesToRead, 0);
    const after = await handle.stat();
    return {
      buffer: buffer.subarray(0, bytesRead),
      isTruncated: after.size > bytesRead,
    };
  } finally {
    await handle.close();
  }
}

/**
 * Reads a bounded UTF-8 prefix without first loading the entire file. Callers own their
 * user-facing truncation marker so each content-export surface stays actionable.
 */
export async function readBoundedTextIfExists(
  filePath: string,
  maxCharacters: number,
): Promise<BoundedText | undefined> {
  const bounded = await readBoundedBytesIfExists(filePath, maxCharacters);
  if (bounded === undefined) return undefined;
  const text = bounded.buffer.toString("utf8");
  return {
    content: text.slice(0, maxCharacters),
    isTruncated: bounded.isTruncated || text.length > maxCharacters,
  };
}

function incompleteUtf8TailLength(buffer: Buffer): number {
  if (buffer.length === 0) return 0;
  let continuationBytes = 0;
  for (let index = buffer.length - 1; index >= 0 && continuationBytes < 3; index -= 1) {
    const byte = buffer[index];
    if (byte === undefined || (byte & 0xc0) !== 0x80) break;
    continuationBytes += 1;
  }
  const lead = buffer[buffer.length - continuationBytes - 1];
  if (lead === undefined) return 0;
  const expectedBytes =
    lead >= 0xc2 && lead <= 0xdf
      ? 2
      : lead >= 0xe0 && lead <= 0xef
        ? 3
        : lead >= 0xf0 && lead <= 0xf4
          ? 4
          : 1;
  const availableBytes = continuationBytes + 1;
  return expectedBytes > availableBytes ? availableBytes : 0;
}

/**
 * Reads a bounded UTF-8 prefix and classifies NUL or malformed UTF-8 as binary without treating a
 * valid multibyte character cut by the byte bound as malformed.
 */
export async function readBoundedUtf8TextIfExists(
  filePath: string,
  maxCharacters: number,
): Promise<BoundedUtf8Text | undefined> {
  const bounded = await readBoundedBytesIfExists(filePath, maxCharacters);
  if (bounded === undefined) return undefined;
  const tailLength = bounded.isTruncated ? incompleteUtf8TailLength(bounded.buffer) : 0;
  const validationBuffer =
    tailLength === 0 ? bounded.buffer : bounded.buffer.subarray(0, -tailLength);
  let isMalformed = false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(validationBuffer);
  } catch {
    isMalformed = true;
  }
  const text = bounded.buffer.toString("utf8");
  return {
    content: text.slice(0, maxCharacters),
    isTruncated: bounded.isTruncated || text.length > maxCharacters,
    isBinary: bounded.buffer.includes(0) || isMalformed,
  };
}
