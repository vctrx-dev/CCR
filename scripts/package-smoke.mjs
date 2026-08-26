import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const reviewRegistry = JSON.parse(
  readFileSync(path.join(root, "src", "review", "dimensions.json"), "utf8"),
);
if (
  typeof reviewRegistry !== "object" ||
  reviewRegistry === null ||
  !("dimensions" in reviewRegistry) ||
  !Array.isArray(reviewRegistry.dimensions) ||
  !reviewRegistry.dimensions.every(
    (dimension) =>
      typeof dimension === "object" &&
      dimension !== null &&
      "id" in dimension &&
      typeof dimension.id === "string",
  )
) {
  throw new Error("Review dimension registry has an invalid shape.");
}
const reviewDimensionIds = reviewRegistry.dimensions.map((dimension) => dimension.id);
const binPath = path.join(root, packageJson.bin.ccr);
const bin = readFileSync(binPath, "utf8");
if (!bin.startsWith("#!/usr/bin/env node\n")) throw new Error("Packed CLI is missing its shebang.");
const packageExports = packageJson.exports;
if (!packageExports || typeof packageExports !== "object" || !("." in packageExports)) {
  throw new Error("Package must define a root programmatic export.");
}
const publicExportFiles = Object.entries(packageExports)
  .filter(([entry]) => entry !== "./package.json")
  .flatMap(([entry, target]) => {
    if (typeof target !== "object" || target === null) {
      throw new Error("Programmatic package exports must declare import and type targets.");
    }
    const paths = [target.types, target.import];
    if (!paths.every((candidate) => typeof candidate === "string")) {
      throw new Error("Programmatic package exports must declare import and type targets.");
    }
    if (entry === "." && typeof target.require !== "string") {
      throw new Error("The root package export must support CommonJS consumers.");
    }
    if (typeof target.require === "string") paths.push(target.require);
    return paths.map((candidate) => candidate.slice(2));
  });

const help = execFileSync(process.execPath, [binPath, "--help"], {
  cwd: root,
  encoding: "utf8",
  windowsHide: true,
});
for (const command of ["setup", "update", "context", "config", "hooks", "uninstall"]) {
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
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
}

try {
  // Keep npm's mutable cache inside this smoke run so concurrent Windows checks cannot lock a
  // workspace-shared cache. The finally block removes it with the consumer fixtures.
  const cache = path.join(temporaryRoot, "npm-cache");
  const pack = JSON.parse(
    runNpm(
      ["pack", "--json", "--ignore-scripts", "--pack-destination", temporaryRoot, "--cache", cache],
      root,
    ),
  )[0];
  const files = pack.files.map((file) => file.path).sort();
  const requiredFiles = ["LICENSE", "README.md", packageJson.bin.ccr, "package.json"]
    .concat(publicExportFiles)
    .map((file) => file.replace(/^\.\//u, ""));
  const missingFiles = requiredFiles.filter((file) => !files.includes(file));
  if (missingFiles.length > 0) {
    throw new Error(`Packed package is missing declared files: ${missingFiles.join(", ")}`);
  }
  const unexpectedFiles = files.filter(
    (file) => !["LICENSE", "README.md", "package.json"].includes(file) && !file.startsWith("dist/"),
  );
  if (unexpectedFiles.length > 0) {
    throw new Error(
      `Packed package contains files outside its declared surface: ${unexpectedFiles.join(", ")}`,
    );
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
  if (
    !installedHelp.includes("Context-aware, stakeholder-aware code review for Claude Code") ||
    !installedHelp.includes("Claude Code skills (run inside Claude Code after setup):") ||
    !installedHelp.includes(`Configured dimension IDs: ${reviewDimensionIds.join(", ") || "none"}`)
  ) {
    throw new Error("Installed CLI help is incomplete or stale.");
  }
  const installedVersion = runInstalled(installedBin, ["--version"], consumer).trim();
  if (installedVersion !== packageJson.version) {
    throw new Error(
      `Installed CLI version ${installedVersion} does not match package ${packageJson.version}.`,
    );
  }
  const esmSdkCheckPath = path.join(consumer, "verify-sdk.mjs");
  writeFileSync(
    esmSdkCheckPath,
    `import { createAsuAimlProviderConfig } from "@vctrx/ccr";
import { DEFAULT_CONTEXT_CONFIG, resolveContextConfig } from "@vctrx/ccr/context";
import { parseReviewDimensionRegistry } from "@vctrx/ccr/review";

const provider = createAsuAimlProviderConfig({ apiKey: "test-key", model: "gpt-5.2" });
const config = resolveContextConfig(DEFAULT_CONTEXT_CONFIG, {
  privacy: { excludedPaths: ["private/**"] },
});
const registry = parseReviewDimensionRegistry({
  dimensions: [{
    id: "quality",
    name: "Quality",
    summary: "Checks observable behavior.",
    criteria: [{ id: "behavior", name: "Behavior", details: "Review behavior." }],
  }],
});

if (provider.model !== "gpt-5.2" || config.privacy.excludedPaths[0] !== "private/**" || registry.dimensions[0]?.id !== "quality") {
  throw new Error("Installed ESM SDK exports are incomplete.");
}
`,
    "utf8",
  );
  execFileSync(process.execPath, [esmSdkCheckPath], { cwd: consumer, windowsHide: true });
  const cjsSdkCheckPath = path.join(consumer, "verify-sdk.cjs");
  writeFileSync(
    cjsSdkCheckPath,
    `const ccr = require("@vctrx/ccr");
const config = ccr.createAsuAimlProviderConfig({ apiKey: "test-key", model: "gpt-5.2" });
if (config.model !== "gpt-5.2") throw new Error("Installed CommonJS SDK export is incomplete.");
`,
    "utf8",
  );
  execFileSync(process.execPath, [cjsSdkCheckPath], { cwd: consumer, windowsHide: true });

  execFileSync("git", ["init", "--quiet"], { cwd: consumer, windowsHide: true });
  const preview = runInstalled(installedBin, ["setup"], consumer);
  if (!preview.includes("CCR setup preview") || existsSync(path.join(consumer, ".ccr"))) {
    throw new Error("Installed CLI setup preview changed the clean consumer repository.");
  }

  // Verify setup applies the human-owned hook policy instead of package installation mutating the repo.
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
  if (existsSync(preCommitPath) || existsSync(postCommitPath) || existsSync(ignorePath)) {
    throw new Error("Package installation changed the repository before setup.");
  }

  runInstalled(installedBin, ["config", "init", "--apply"], scripted);
  const configManualPath = path.join(scripted, ".ccr", "config-manual.md");
  if (
    !existsSync(configManualPath) ||
    !readFileSync(configManualPath, "utf8").includes("# CCR configuration manual") ||
    !readFileSync(configManualPath, "utf8").includes("instructions.updateDecisionsMd")
  ) {
    throw new Error("config init did not create the configuration manual.");
  }
  runInstalled(installedBin, ["setup", "--apply"], scripted);
  const decisionsPath = path.join(scripted, ".ccr", "decisions.md");
  const installedConfig = JSON.parse(
    readFileSync(path.join(scripted, ".ccr", "config.json"), "utf8"),
  );
  if (!existsSync(decisionsPath) || readFileSync(decisionsPath, "utf8") !== "") {
    throw new Error("setup did not create an empty decisions document.");
  }
  if (installedConfig.instructions?.updateDecisionsMd !== false) {
    throw new Error("Generated configuration did not default decision updates to false.");
  }
  if (existsSync(preCommitPath) || existsSync(postCommitPath)) {
    throw new Error("setup installed hooks without repository-aware skill analysis.");
  }
  const hooksSkillPath = path.join(scripted, ".claude", "skills", "ccr-hooks", "SKILL.md");
  if (!existsSync(hooksSkillPath)) {
    throw new Error("setup did not install the repository-aware hook skill.");
  }
  const manualSkillPath = path.join(scripted, ".claude", "skills", "ccr", "SKILL.md");
  if (!existsSync(manualSkillPath)) {
    throw new Error("setup did not install the current CCR support skill.");
  }
  const reviewSkillPath = path.join(scripted, ".claude", "skills", "ccr-review", "SKILL.md");
  const dimensionsPath = path.join(
    scripted,
    ".claude",
    "skills",
    "ccr",
    "references",
    "dimensions.md",
  );
  if (!existsSync(reviewSkillPath) || !existsSync(dimensionsPath)) {
    throw new Error("setup did not install the data-driven review skill and dimensions.");
  }
  if (existsSync(path.join(scripted, ".claude", "skills", "ccr-codebase"))) {
    throw new Error("setup installed the retired ccr-codebase skill.");
  }
  if (
    !existsSync(ignorePath) ||
    !readFileSync(ignorePath, "utf8").includes("# ccr:start - local context continuity")
  ) {
    throw new Error("setup did not add local-continuity ignore rules.");
  }
  const projectPath = path.join(scripted, ".ccr", "project.md");
  const journalPath = path.join(scripted, ".ccr", "journal", "package-update.md");
  writeFileSync(projectPath, "# Team-owned project context\n", "utf8");
  mkdirSync(path.dirname(journalPath), { recursive: true });
  writeFileSync(journalPath, "# Local continuity\n", "utf8");
  const updateOutput = runInstalled(installedBin, ["update", "--apply"], scripted);
  if (
    !updateOutput.includes("CCR update is already current.") ||
    readFileSync(projectPath, "utf8") !== "# Team-owned project context\n" ||
    readFileSync(journalPath, "utf8") !== "# Local continuity\n"
  ) {
    throw new Error("package update did not preserve user-owned CCR context and local continuity.");
  }

  process.stdout.write(
    `Package smoke passed (${pack.name}@${pack.version}, installed ${files.length} files).\n`,
  );
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
