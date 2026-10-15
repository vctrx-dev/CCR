import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

// One release scenario: pack, one-shot setup, lose the setup cache, use local support, uninstall.
const root = process.cwd();
const metadata = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "ccr-package-"));
assert(path.resolve(temporaryRoot).startsWith(path.resolve(os.tmpdir()) + path.sep));
const cache = path.join(temporaryRoot, "npm-cache");
const repository = path.join(temporaryRoot, "repository with spaces");
const npmCli = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
const npmCommand = existsSync(npmCli) ? process.execPath : "npm";
const npmPrefix = existsSync(npmCli) ? [npmCli] : [];

function run(command, args, cwd = repository) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function npm(args, cwd = repository) {
  return run(npmCommand, [...npmPrefix, ...args, "--cache", cache], cwd);
}

try {
  const packed = JSON.parse(
    npm(["pack", "--json", "--ignore-scripts", "--pack-destination", temporaryRoot], root),
  )[0];
  assert.equal(packed.name, metadata.name);
  const files = new Set(packed.files.map(({ path }) => path));
  for (const file of ["package.json", "README.md", "USER_MANUAL.md", "LICENSE", metadata.bin.ccr])
    assert(files.has(file));
  const tarball = path.join(temporaryRoot, packed.filename);
  mkdirSync(repository);
  run("git", ["init", "--quiet"]);
  const setup = (args) =>
    run(npmCommand, [
      ...npmPrefix,
      "exec",
      "--yes",
      "--offline",
      "--cache",
      cache,
      `--package=${tarball}`,
      "--",
      "ccr",
      ...args,
    ]);
  assert.match(setup(["setup", "--dry-run"]), /\.ccr\/private\/runtime\/dist\/cli\/index\.cjs/u);
  assert(!existsSync(path.join(repository, ".ccr")));
  setup(["setup"]);
  assert(!existsSync(path.join(repository, "package.json")));
  assert(!existsSync(path.join(repository, "node_modules")));

  // Both supported module formats must supply local runtime resources through the public API too.
  const npxRoot = path.join(cache, "_npx");
  const packageRoot = readdirSync(npxRoot)
    .map((entry) => path.join(npxRoot, entry, "node_modules", "@vctrx", "ccr"))
    .find((entry) => existsSync(path.join(entry, "package.json")));
  assert(packageRoot);
  const require = createRequire(import.meta.url);
  for (const [entry, format] of [
    ["dist/context/index.js", "esm"],
    ["dist/index.cjs", "cjs"],
  ]) {
    const sdk =
      format === "esm"
        ? await import(pathToFileURL(path.join(packageRoot, entry)).href)
        : require(path.join(packageRoot, entry));
    const sdkRoot = path.join(temporaryRoot, format);
    mkdirSync(sdkRoot);
    await sdk.applySetup(sdkRoot);
    assert.equal(
      run(
        process.execPath,
        [path.join(sdkRoot, ".ccr/private/runtime/dist/cli/index.cjs"), "--version"],
        sdkRoot,
      ).trim(),
      metadata.version,
    );
  }
  renameSync(npxRoot, path.join(cache, "discarded-setup-cache"));
  const cliPath = path.join(repository, ".ccr/private/runtime/dist/cli/index.cjs");
  const local = (args) => run(process.execPath, [cliPath, ...args]);
  assert.equal(local(["--version"]).trim(), metadata.version);
  assert.match(local(["context", "save-review", "--help"]), /--expected-state/u);
  local(["config", "validate"]);
  local(["config", "set-domain-if-unspecified", "education-technology"]);
  assert.equal(JSON.parse(local(["config", "--resolved"])).domain, "education-technology");
  local(["context", "validate"]);
  assert(JSON.parse(local(["context", "dimensions", "--json"])).dimensions.length > 0);
  local(["context", "journal"]);
  const state = JSON.parse(local(["context", "review-state"]));
  local([
    "context",
    "assess",
    state.fingerprint,
    state.contextFingerprint,
    "Local setup support verified.",
  ]);
  for (const id of ["ccr", "ccr-context", "ccr-hooks", "ccr-review"]) {
    const skill = readFileSync(path.join(repository, ".claude/skills", id, "SKILL.md"), "utf8");
    assert.match(skill, /node \.ccr\/private\/runtime\/dist\/cli\/index\.cjs/u);
    assert.doesNotMatch(skill, /\bnpx\b|--no-install/u);
  }

  // Old setup's marked wrapper is removable locally while unrelated hook bytes stay intact.
  const hookPath = path.join(repository, ".git/hooks/pre-commit");
  const originalHook = "#!/bin/sh\n# existing user check\n";
  writeFileSync(
    hookPath,
    `${originalHook}# ccr:start\nnpx --no-install ccr hooks pre-commit\n# ccr:end\n`,
  );
  local(["hooks", "uninstall"]);
  assert.equal(readFileSync(hookPath, "utf8"), originalHook);
  const projectPath = path.join(repository, ".ccr/project.md");
  const project = "# Project\n\nHuman-owned product context.\n";
  writeFileSync(projectPath, project);
  assert.match(local(["update"]), /already current/u);
  assert.equal(readFileSync(projectPath, "utf8"), project);
  local(["uninstall"]);
  assert(!existsSync(path.join(repository, ".ccr")));
  assert(!existsSync(path.join(repository, ".claude/skills/ccr-context")));
  assert.equal(readFileSync(hookPath, "utf8"), originalHook);
  process.stdout.write(
    `Package smoke passed (${metadata.name}@${metadata.version}; local-only setup, API, and cleanup).\n`,
  );
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
