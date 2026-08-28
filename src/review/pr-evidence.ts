import { execFile } from "node:child_process";
import { z } from "zod";
import { normalizeRepositoryPath, sortUniqueRepositoryPaths } from "../context/evidence-format";
import { filterExcludedPaths, readResolvedContextConfig } from "../context/privacy";

/**
 * Privacy-preserving GitHub PR evidence adapter. Extend this boundary for remote review evidence so
 * provider output is validated, bounded, and filtered before it reaches a review prompt.
 */

const MAX_METADATA_BYTES = 65_536;
const MAX_FILE_PAGE_BYTES = 262_144;
const MAX_PATCH_BYTES = 524_288;
const MAX_HEAD_FILE_BYTES = 131_072;
const MAX_HEAD_RESPONSE_BYTES = 180_000;
const MAX_HEAD_FILES = 8;
const MAX_INITIAL_EVIDENCE_BYTES = 786_432;
const MAX_HEAD_EVIDENCE_BYTES = 1_310_720;
const GITHUB_TIMEOUT_MS = 30_000;

const pullRequestNumberSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const repositorySchema = z.object({
  nameWithOwner: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u),
});
const pullRequestSchema = z.object({
  baseRefName: z.string().min(1).max(1_024),
  baseRefOid: z.string().regex(/^[0-9a-f]{40,64}$/u),
  headRefName: z.string().min(1).max(1_024),
  headRefOid: z.string().regex(/^[0-9a-f]{40,64}$/u),
  number: pullRequestNumberSchema,
  title: z.string().max(4_096),
});
const pullRequestFileSchema = z.object({
  filename: z.string().min(1).max(4_096),
  previousFilename: z.string().min(1).max(4_096).nullable(),
  status: z.string().min(1).max(64),
});
const pullRequestFilePageSchema = z.array(pullRequestFileSchema).max(100);
const headResponseSchema = z.object({
  content: z.string().max(MAX_HEAD_RESPONSE_BYTES),
  encoding: z.literal("base64"),
});
const requestedHeadPathsSchema = z.array(z.string().min(1).max(4_096)).min(1).max(MAX_HEAD_FILES);

export type PullRequestMetadata = z.infer<typeof pullRequestSchema>;

export interface PullRequestEvidence {
  changedPaths: string[];
  patch: string;
  pullRequest: PullRequestMetadata;
  repository: string;
}

export interface PullRequestHeadEvidence {
  files: Array<{ content: string; path: string }>;
  headRefOid: string;
  pullRequest: number;
}

export interface PullRequestCommand {
  arguments_: readonly string[];
  maximumBytes: number;
  root: string;
}

export type PullRequestCommandRunner = (command: PullRequestCommand) => Promise<string>;

type ScopedRunner = (arguments_: readonly string[], maximumBytes: number) => Promise<string>;

function runGitHub({ arguments_, maximumBytes, root }: PullRequestCommand): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "gh",
      [...arguments_],
      {
        cwd: root,
        encoding: "utf8",
        maxBuffer: maximumBytes + 4,
        timeout: GITHUB_TIMEOUT_MS,
        windowsHide: true,
      },
      (error, stdout) => {
        if (error) {
          reject(new Error("GitHub CLI request failed or exceeded its safe response limit."));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

function scopeRunner(root: string, runner: PullRequestCommandRunner): ScopedRunner {
  return (arguments_, maximumBytes) => runner({ arguments_, maximumBytes, root });
}

async function readBoundedGitHubOutput(
  runner: ScopedRunner,
  arguments_: readonly string[],
  maximumBytes: number,
): Promise<string> {
  let output: string;
  try {
    output = await runner(arguments_, maximumBytes);
  } catch {
    throw new Error("GitHub CLI request failed or exceeded its safe response limit.");
  }
  if (Buffer.byteLength(output, "utf8") > maximumBytes) {
    throw new Error("GitHub CLI response exceeded its safe response limit.");
  }
  return output;
}

function parseJson(output: string): unknown {
  try {
    const parsed: unknown = JSON.parse(output);
    return parsed;
  } catch {
    throw new Error("GitHub CLI returned malformed JSON.");
  }
}

async function readPullRequestPage(
  repository: string,
  pullRequest: number,
  page: number,
  runner: ScopedRunner,
): Promise<z.infer<typeof pullRequestFilePageSchema>> {
  const output = await readBoundedGitHubOutput(
    runner,
    [
      "api",
      `repos/${repository}/pulls/${pullRequest}/files?per_page=100&page=${page}`,
      "--jq",
      "[.[] | {filename, status, previousFilename: (.previous_filename // null)}]",
    ],
    MAX_FILE_PAGE_BYTES,
  );
  return pullRequestFilePageSchema.parse(parseJson(output));
}

interface PullRequestSelection {
  changedPaths: string[];
  metadata: PullRequestMetadata;
  repository: string;
}

async function resolvePullRequestSelection(
  root: string,
  candidate: number,
  runner: ScopedRunner,
): Promise<PullRequestSelection> {
  const pullRequest = pullRequestNumberSchema.parse(candidate);
  const repositoryOutput = await readBoundedGitHubOutput(
    runner,
    ["repo", "view", "--json", "nameWithOwner"],
    MAX_METADATA_BYTES,
  );
  const { nameWithOwner: repository } = repositorySchema.parse(parseJson(repositoryOutput));
  const metadataArguments = [
    "pr",
    "view",
    String(pullRequest),
    "--repo",
    repository,
    "--json",
    "number,title,baseRefName,headRefName,baseRefOid,headRefOid",
  ] as const;
  const metadataOutput = await readBoundedGitHubOutput(
    runner,
    metadataArguments,
    MAX_METADATA_BYTES,
  );
  const metadata = pullRequestSchema.parse(parseJson(metadataOutput));
  if (metadata.number !== pullRequest) throw new Error("GitHub returned a different pull request.");

  const first = await readPullRequestPage(repository, pullRequest, 1, runner);
  const second =
    first.length === 100 ? await readPullRequestPage(repository, pullRequest, 2, runner) : [];
  if (second.length === 100) {
    const third = await readPullRequestPage(repository, pullRequest, 3, runner);
    if (third.length > 0) throw new Error("Pull request exceeds 200 changed paths.");
  }
  const files = [...first, ...second];
  const config = await readResolvedContextConfig(root);
  const evidencePaths = files.flatMap(({ filename, previousFilename }) =>
    previousFilename === null ? [filename] : [filename, previousFilename],
  );
  const filtered = filterExcludedPaths(evidencePaths, config.privacy.excludedPaths);
  if (filtered.excluded.length > 0) {
    throw new Error("Pull request contains privacy-excluded paths; review stopped before content.");
  }
  const changedPaths = sortUniqueRepositoryPaths(files.map(({ filename }) => filename));
  if (changedPaths.length !== files.length)
    throw new Error("Pull request contains duplicate paths.");
  return { changedPaths, metadata, repository };
}

function assertEvidenceOutputLimit(value: unknown, maximumBytes: number): void {
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > maximumBytes) {
    throw new Error("Pull request evidence exceeds its combined safe output limit.");
  }
}

/** Returns one validated, privacy-approved PR metadata and patch packet. */
export async function readSafePullRequestEvidence(
  root: string,
  pullRequest: number,
  runner: PullRequestCommandRunner = runGitHub,
): Promise<PullRequestEvidence> {
  const scopedRunner = scopeRunner(root, runner);
  const selection = await resolvePullRequestSelection(root, pullRequest, scopedRunner);
  const patch = await readBoundedGitHubOutput(
    scopedRunner,
    [
      "api",
      "-H",
      "Accept: application/vnd.github.patch",
      `repos/${selection.repository}/compare/${selection.metadata.baseRefOid}...${selection.metadata.headRefOid}`,
    ],
    MAX_PATCH_BYTES,
  );
  const evidence = {
    changedPaths: selection.changedPaths,
    patch,
    pullRequest: selection.metadata,
    repository: selection.repository,
  };
  assertEvidenceOutputLimit(evidence, MAX_INITIAL_EVIDENCE_BYTES);
  return evidence;
}

function encodeRepositoryPath(relativePath: string): string {
  return relativePath.split("/").map(encodeURIComponent).join("/");
}

function decodeHeadContent(output: string): string {
  const response = headResponseSchema.parse(parseJson(output));
  const compact = response.content.replace(/\s/gu, "");
  if (
    compact.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(compact)
  ) {
    throw new Error("GitHub returned malformed base64 file content.");
  }
  const decoded = Buffer.from(compact, "base64");
  if (decoded.byteLength > MAX_HEAD_FILE_BYTES) {
    throw new Error(`Pull request head file exceeds ${MAX_HEAD_FILE_BYTES} bytes.`);
  }
  const text = decoded.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(decoded)) {
    throw new Error("Pull request head file is not UTF-8 text.");
  }
  return text;
}

/** Returns one bounded packet for up to eight approved files at the immutable PR head. */
export async function readSafePullRequestHeadEvidence(
  root: string,
  pullRequest: number,
  candidates: unknown,
  runner: PullRequestCommandRunner = runGitHub,
): Promise<PullRequestHeadEvidence> {
  const requested = requestedHeadPathsSchema.parse(candidates).map(normalizeRepositoryPath);
  if (new Set(requested).size !== requested.length) {
    throw new Error("Pull request head paths must be unique.");
  }
  const scopedRunner = scopeRunner(root, runner);
  const selection = await resolvePullRequestSelection(root, pullRequest, scopedRunner);
  for (const candidate of requested) {
    if (!selection.changedPaths.includes(candidate)) {
      throw new Error("Pull request head file is not an approved changed path.");
    }
  }
  const files: Array<{ content: string; path: string }> = [];
  for (const relativePath of requested) {
    const output = await readBoundedGitHubOutput(
      scopedRunner,
      [
        "api",
        `repos/${selection.repository}/contents/${encodeRepositoryPath(relativePath)}?ref=${selection.metadata.headRefOid}`,
        "--jq",
        "{content, encoding}",
      ],
      MAX_HEAD_RESPONSE_BYTES,
    );
    files.push({ content: decodeHeadContent(output), path: relativePath });
  }
  const evidence = {
    files,
    headRefOid: selection.metadata.headRefOid,
    pullRequest: selection.metadata.number,
  };
  assertEvidenceOutputLimit(evidence, MAX_HEAD_EVIDENCE_BYTES);
  return evidence;
}
