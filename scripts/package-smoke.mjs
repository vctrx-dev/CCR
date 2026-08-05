import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const binPath = path.join(root, packageJson.bin.ccr);
const bin = readFileSync(binPath, "utf8");
if (!bin.startsWith("#!/usr/bin/env node\n")) throw new Error("Packed CLI is missing its shebang.");

const help = execFileSync(process.execPath, [binPath, "--help"], {
  cwd: root,
  encoding: "utf8",
  windowsHide: true,
});
for (const command of ["setup", "context", "config", "hooks", "uninstall"]) {
  if (!help.includes(command)) throw new Error(`Packed CLI help is missing ${command}.`);
}

const npmCli = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
const npmCommand = existsSync(npmCli) ? process.execPath : "npm";
const npmPrefix = existsSync(npmCli) ? [npmCli] : [];
const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "ccr-package-"));

function runNpm(arguments_, cwd) {
  return execFileSync(npmCommand, [...npmPrefix, ...arguments_], {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
}

function runInstalled(bin, arguments_, cwd) {
  if (process.platform !== "win32") {
    return execFileSync(bin, arguments_, { cwd, encoding: "utf8", windowsHide: true });
  }

  return execFileSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/c", bin, ...arguments_], {
    cwd: path.dirname(bin),
    encoding: "utf8",
    windowsHide: true,
  });
}

try {
  const cache = path.join(root, ".npm");
  const pack = JSON.parse(
    runNpm(
      ["pack", "--json", "--ignore-scripts", "--pack-destination", temporaryRoot, "--cache", cache],
      root,
    ),
  )[0];
  const files = pack.files.map((file) => file.path).sort();
  const expected = ["LICENSE", "README.md", "dist/cli/index.cjs", "package.json"];
  if (JSON.stringify(files) !== JSON.stringify(expected)) {
    throw new Error(`Unexpected packed files: ${files.join(", ")}`);
  }

  const tarball = path.join(temporaryRoot, pack.filename);
  const consumer = path.join(temporaryRoot, "consumer");
  mkdirSync(consumer);
  writeFileSync(
    path.join(consumer, "package.json"),
    `${JSON.stringify({ name: "ccr-smoke-consumer", private: true }, null, 2)}\n`,
  );
  runNpm(
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
      "--offline",
      "--cache",
      cache,
      tarball,
    ],
    consumer,
  );

  const installedBin = path.join(
    consumer,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "ccr.cmd" : "ccr",
  );
  const installedHelp = runInstalled(installedBin, ["--help"], consumer);
  if (!installedHelp.includes("Context management for ethical review")) {
    throw new Error("Installed CLI help did not run.");
  }

  execFileSync("git", ["init", "--quiet"], { cwd: consumer, windowsHide: true });
  const preview = runInstalled(installedBin, ["setup"], consumer);
  if (!preview.includes("CCR setup preview") || existsSync(path.join(consumer, ".ccr"))) {
    throw new Error("Installed CLI setup preview changed the clean consumer repository.");
  }

  // Verify postinstall installs both advisory hooks and local ignore rules in a consumer repo.
  const scripted = path.join(temporaryRoot, "consumer-scripted");
  mkdirSync(scripted);
  writeFileSync(
    path.join(scripted, "package.json"),
    `${JSON.stringify({ name: "ccr-smoke-scripted", private: true }, null, 2)}\n`,
  );
  execFileSync("git", ["init", "--quiet"], { cwd: scripted, windowsHide: true });
  runNpm(
    [
      "install",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
      "--offline",
      "--cache",
      cache,
      tarball,
    ],
    scripted,
  );

  const preCommitPath = path.join(scripted, ".git", "hooks", "pre-commit");
  const postCommitPath = path.join(scripted, ".git", "hooks", "post-commit");
  const ignorePath = path.join(scripted, ".gitignore");
  if (!existsSync(preCommitPath) || !readFileSync(preCommitPath, "utf8").includes("# ccr:start")) {
    throw new Error("postinstall did not install the pre-commit hook.");
  }
  if (
    !existsSync(postCommitPath) ||
    !readFileSync(postCommitPath, "utf8").includes("# ccr:start - post-commit context check")
  ) {
    throw new Error("postinstall did not install the post-commit hook.");
  }
  if (
    !existsSync(ignorePath) ||
    !readFileSync(ignorePath, "utf8").includes("# ccr:start - local context continuity")
  ) {
    throw new Error("postinstall did not add local-continuity ignore rules.");
  }

  process.stdout.write(
    `Package smoke passed (${pack.name}@${pack.version}, installed ${files.length} files).\n`,
  );
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
