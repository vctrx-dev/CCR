import { execFileSync, spawn } from "node:child_process";

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

/** Executes one bounded synchronous Git metadata operation. */
export function runGit(
  root: string,
  args: string[],
  maxBuffer = DEFAULT_GIT_BUFFER_BYTES,
  shouldSuppressErrors = false,
): string {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer,
    stdio: shouldSuppressErrors ? ["ignore", "pipe", "ignore"] : undefined,
    windowsHide: true,
  });
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
    const child = spawn("git", args, {
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
