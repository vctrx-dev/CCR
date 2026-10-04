import { execFile, execFileSync, spawn } from "node:child_process";
import { promisify } from "node:util";

/**
 * Bounded read-only Git process adapter.
 *
 * Repository modules should extend this adapter when they need another output-bounded Git read;
 * callers that expose repository content must still pass through the privacy and evidence layers.
 */

export interface BoundedGitText {
  content: string;
  isBinary: boolean;
  isTruncated: boolean;
}

const DEFAULT_GIT_BUFFER_BYTES = 16 * 1024 * 1024;
const execFileAsync = promisify(execFile);

function literalPathArguments(args: string[]): string[] {
  // check-ignore already treats its inputs as literal paths and rejects pathspec magic.
  return args[0] === "check-ignore" ? args : ["--literal-pathspecs", ...args];
}

/** Bounded metadata reads may contain NUL path separators; unlike evidence, retain those bytes. */
export async function runGitMetadata(root: string, args: string[]): Promise<string> {
  try {
    const result = await execFileAsync("git", literalPathArguments(args), {
      cwd: root,
      encoding: "utf8",
      maxBuffer: DEFAULT_GIT_BUFFER_BYTES,
      timeout: 30_000,
      windowsHide: true,
    });
    return result.stdout;
  } catch {
    throw new Error("Git metadata read failed or exceeded its safe limit.");
  }
}

/** Executes one bounded synchronous Git metadata operation. */
export function runGit(
  root: string,
  args: string[],
  maxBuffer = DEFAULT_GIT_BUFFER_BYTES,
  shouldSuppressErrors = false,
  input?: string,
): string {
  if (input !== undefined && Buffer.byteLength(input, "utf8") > 1_048_576) {
    throw new Error("Git input exceeded its safe limit.");
  }
  return execFileSync("git", literalPathArguments(args), {
    cwd: root,
    encoding: "utf8",
    maxBuffer,
    timeout: 30_000,
    input,
    stdio: shouldSuppressErrors
      ? [input === undefined ? "ignore" : "pipe", "pipe", "ignore"]
      : undefined,
    windowsHide: true,
  });
}

/** Quotes a path in Git's C style; `--stdin-paths` rejects JSON's `\uXXXX` control escapes. */
export function quoteGitPath(file: string): string {
  let quoted = '"';
  for (const character of file) {
    const code = character.codePointAt(0) ?? 0;
    if (character === '"' || character === "\\") quoted += `\\${character}`;
    else if (code < 0x20 || code === 0x7f) quoted += `\\${code.toString(8).padStart(3, "0")}`;
    else quoted += character;
  }
  return `${quoted}"`;
}

/** Hashes bounded batches of exact filenames; failed batches split to isolate missing paths. */
export function hashGitWorktreePaths(
  root: string,
  paths: string[],
  shouldApplyFilters: boolean,
): Map<string, string> {
  const fingerprints = new Map<string, string>();
  const readBatch = (batch: string[]): void => {
    try {
      // --stdin-paths uses Git's quoted-path syntax, not shell parsing or pathspec matching.
      const output = runGit(
        root,
        ["hash-object", ...(shouldApplyFilters ? [] : ["--no-filters"]), "--stdin-paths"],
        batch.length * 66,
        true,
        `${batch.map(quoteGitPath).join("\n")}\n`,
      );
      const hashes = output.trimEnd().split("\n");
      if (
        hashes.length !== batch.length ||
        hashes.some((hash) => !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(hash))
      ) {
        throw new Error("Git returned invalid worktree fingerprints.");
      }
      for (const [index, file] of batch.entries()) {
        fingerprints.set(file, hashes[index] ?? "missing");
      }
    } catch {
      if (batch.length === 1) {
        const file = batch[0];
        if (file !== undefined) fingerprints.set(file, "missing");
        return;
      }
      const midpoint = Math.floor(batch.length / 2);
      readBatch(batch.slice(0, midpoint));
      readBatch(batch.slice(midpoint));
    }
  };
  for (let offset = 0; offset < paths.length; offset += 128) {
    readBatch(paths.slice(offset, offset + 128));
  }
  return fingerprints;
}

/**
 * Streams Git output into a fixed character budget so large blobs and diffs are never retained in
 * full. NUL bytes and invalid UTF-8 fail into an explicit binary result for evidence callers.
 */
export function runBoundedGit(
  root: string,
  args: string[],
  maximumCharacters: number,
): Promise<BoundedGitText> {
  if (!Number.isSafeInteger(maximumCharacters) || maximumCharacters < 1) {
    throw new Error("Bounded Git reads require a positive safe character limit.");
  }
  return new Promise((resolve, reject) => {
    const child = spawn("git", literalPathArguments(args), {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let content = "";
    let errorOutput = "";
    let isBinary = false;
    let isFinished = false;
    let isTruncated = false;
    let isTerminatedForBoundary = false;

    const terminate = (): void => {
      isTerminatedForBoundary = true;
      child.kill();
    };
    child.stdout.on("data", (chunk: Buffer) => {
      if (isTerminatedForBoundary) return;
      if (chunk.includes(0)) {
        isBinary = true;
        terminate();
        return;
      }
      let decoded: string;
      try {
        decoded = decoder.decode(chunk, { stream: true });
      } catch {
        isBinary = true;
        terminate();
        return;
      }
      if (content.length + decoded.length > maximumCharacters) {
        content = `${content}${decoded}`.slice(0, maximumCharacters);
        isTruncated = true;
        terminate();
        return;
      }
      content += decoded;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      if (errorOutput.length < 2_000) errorOutput += chunk.slice(0, 2_000 - errorOutput.length);
    });
    child.on("error", (error: unknown) => {
      if (isFinished) return;
      isFinished = true;
      reject(error);
    });
    child.on("close", (code) => {
      if (isFinished) return;
      isFinished = true;
      if (!isTerminatedForBoundary) {
        try {
          const final = decoder.decode();
          if (content.length + final.length > maximumCharacters) {
            content = `${content}${final}`.slice(0, maximumCharacters);
            isTruncated = true;
          } else {
            content += final;
          }
        } catch {
          isBinary = true;
        }
      }
      if (code !== 0 && !isTerminatedForBoundary) {
        reject(
          new Error(`Git evidence read failed${errorOutput ? `: ${errorOutput.trim()}` : "."}`),
        );
        return;
      }
      resolve({ content, isBinary, isTruncated });
    });
  });
}
