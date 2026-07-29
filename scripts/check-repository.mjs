#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_SCANNED_BYTES = 1024 * 1024;
const ALLOWED_ENV_SUFFIXES = [".example", ".sample", ".template"];
const GENERATED_PATH_PATTERN =
  /(^|\/)(?:\.cache|\.npm|\.nyc_output|\.pnpm-store|\.temp|\.tmp|blob-report|coverage|dist|logs|node_modules|playwright-report|temp|test-results|tmp)(\/|$)/;
const PRIVATE_FILE_PATTERN = /\.(jks|key|keystore|p12|pfx|pem)$/i;
const LOCAL_ONLY_PATH_PATTERN =
  /(^|\/)(?:\.claude\/(?:settings\.local\.json|worktrees(?:\/.*)?)|\.ccr\/(?:cache|journal|private|tmp)(?:\/.*)?|(?:\.npmrc|\.pypirc|\.netrc)|(?:id_rsa|id_dsa|id_ecdsa|id_ed25519)|credentials\.json|service-account[^/]*\.json|[^/]+\.response\.[^/]+|[^/]+\.log)$/i;
const SECRET_PATTERNS = [
  { label: "private key", pattern: /-----BEGIN (?:EC |OPENSSH |RSA )?PRIVATE KEY-----/ },
  { label: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: "Anthropic API key", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  { label: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
  { label: "OpenAI project key", pattern: /\bsk-proj-[A-Za-z0-9_-]{20,}\b/ },
];

function runGit(args, encoding = "utf8") {
  return execFileSync("git", args, {
    encoding,
    maxBuffer: MAX_FILE_BYTES + 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function splitNullTerminated(value) {
  return value.split("\0").filter(Boolean);
}

function getPaths(mode) {
  if (mode === "tracked") {
    return splitNullTerminated(runGit(["ls-tree", "-r", "--name-only", "-z", "HEAD"]));
  }

  return splitNullTerminated(
    runGit(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]),
  );
}

function getObjectSpec(mode, path) {
  return mode === "tracked" ? `HEAD:${path}` : `:${path}`;
}

function isForbiddenEnvironmentPath(path) {
  const name = path.split("/").pop() ?? "";
  if (!name.startsWith(".env")) {
    return false;
  }

  return !ALLOWED_ENV_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

export function findPathFailures(path) {
  const failures = [];

  if (GENERATED_PATH_PATTERN.test(path)) {
    failures.push("generated dependency/build output must not be committed");
  }
  if (isForbiddenEnvironmentPath(path)) {
    failures.push("environment files may contain credentials; commit a template instead");
  }
  if (PRIVATE_FILE_PATTERN.test(path)) {
    failures.push("private key or certificate-container file is not allowed");
  }
  if (LOCAL_ONLY_PATH_PATTERN.test(path)) {
    failures.push("credential or local-only configuration file is not allowed");
  }

  return failures;
}

export function findContentSecretLabels(text) {
  return SECRET_PATTERNS.filter((secret) => secret.pattern.test(text)).map(
    (secret) => secret.label,
  );
}

function inspectPath(mode, path) {
  const failures = findPathFailures(path);
  const objectSpec = getObjectSpec(mode, path);
  let size;
  try {
    size = Number(runGit(["cat-file", "-s", objectSpec]).trim());
  } catch {
    failures.push("Git could not read the file content");
    return failures;
  }

  if (size > MAX_FILE_BYTES) {
    failures.push(`file is larger than ${MAX_FILE_BYTES / 1024 / 1024} MiB`);
    return failures;
  }
  if (size > MAX_SCANNED_BYTES) {
    return failures;
  }

  const content = runGit(["show", objectSpec], "buffer");
  if (content.includes(0)) {
    return failures;
  }

  const text = content.toString("utf8");
  for (const label of findContentSecretLabels(text)) {
    failures.push(`possible ${label} detected`);
  }

  return failures;
}

function checkDiff(mode) {
  if (mode !== "staged") {
    return [];
  }

  try {
    runGit(["diff", "--cached", "--check"]);
    return [];
  } catch (error) {
    const stderr =
      error && typeof error === "object" && "stderr" in error
        ? String(error.stderr).trim()
        : "staged diff contains whitespace errors or conflict markers";
    return [stderr];
  }
}

function main() {
  const mode = process.argv.includes("--tracked") ? "tracked" : "staged";
  const paths = getPaths(mode);
  const failures = checkDiff(mode);

  for (const path of paths) {
    for (const message of inspectPath(mode, path)) {
      failures.push(`${path}: ${message}`);
    }
  }

  if (failures.length > 0) {
    console.error(`Repository ${mode} safety check failed:`);
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    process.exit(1);
  }

  console.log(`Repository ${mode} safety check passed (${paths.length} files checked).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
