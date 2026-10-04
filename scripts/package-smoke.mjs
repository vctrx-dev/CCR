import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  parseReviewDimensionRegistry,
  renderReviewDimensionReference,
} from "../dist/review/index.js";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const reviewSource = JSON.parse(
  readFileSync(path.join(root, "src", "review", "dimensions.json"), "utf8"),
);
const reviewRegistry = parseReviewDimensionRegistry(reviewSource);
const reviewDimensionIds = reviewRegistry.dimensions.map((dimension) => dimension.id);
const inspectionSource = readFileSync(
  path.join(root, "src", "cli", "context-inspection.ts"),
  "utf8",
);
const inspectionCommands = [...inspectionSource.matchAll(/\.command\("([^" ]+)/gu)].map(
  (match) => match[1],
);
const inspectionOptions = [
  ...inspectionSource.matchAll(/\.command\("([^" ]+)[\s\S]*?(?=\n {2}context\b|$)/gu),
].flatMap((command) =>
  [...command[0].matchAll(/\.option\("([^" ]+)/gu)].map((option) => ({
    command: command[1],
    option: option[1],
  })),
);
const configManualSource = readFileSync(
  path.join(root, "src", "context", "config-manual.ts"),
  "utf8",
);
const configManualHeading = /CONFIG_MANUAL = `(# [^\r\n]+)/u.exec(configManualSource)?.[1];
if (configManualHeading === undefined) {
  throw new Error("Configuration manual source is missing its heading.");
}
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
    if (typeof target === "string" && entry.endsWith(".json")) return [target.slice(2)];
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

function inspectNpm(arguments_, cwd) {
  const result = spawnSync(npmCommand, [...npmPrefix, ...arguments_], {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    throw new Error("npm package inspection failed.");
  }
  return { stderr: result.stderr, stdout: result.stdout };
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
  const packageInspection = inspectNpm(
    ["pack", "--dry-run", "--json", "--ignore-scripts", "--cache", cache],
    root,
  );
  if (packageInspection.stderr.includes("npm auto-corrected some errors")) {
    throw new Error("npm pack would remove or rewrite package metadata.");
  }
  JSON.parse(packageInspection.stdout);
  const pack = JSON.parse(
    runNpm(
      ["pack", "--json", "--ignore-scripts", "--pack-destination", temporaryRoot, "--cache", cache],
      root,
    ),
  )[0];
  const files = pack.files.map((file) => file.path).sort();
  const documentationFiles = ["README.md", "USER_MANUAL.md", "TEST.md"];
  const requiredFiles = ["LICENSE", ...documentationFiles, packageJson.bin.ccr, "package.json"]
    .concat(publicExportFiles)
    .map((file) => file.replace(/^\.\//u, ""));
  const missingFiles = requiredFiles.filter((file) => !files.includes(file));
  if (missingFiles.length > 0) {
    throw new Error(`Packed package is missing declared files: ${missingFiles.join(", ")}`);
  }
  const unexpectedFiles = files.filter(
    (file) =>
      !["LICENSE", ...documentationFiles, "package.json"].includes(file) &&
      !file.startsWith("dist/"),
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
    !installedHelp.includes(packageJson.description) ||
    !installedHelp.includes("Claude Code skills (run inside Claude Code after setup):") ||
    !installedHelp.includes("Current dimension IDs and criteria: ccr context dimensions --json.")
  ) {
    throw new Error("Installed CLI help is incomplete or stale.");
  }
  const installedContextHelp = runInstalled(installedBin, ["context", "--help"], consumer);
  for (const { command, option } of inspectionOptions) {
    const commandHelp = runInstalled(installedBin, ["context", command, "--help"], consumer);
    if (!commandHelp.includes(option)) {
      throw new Error(`Installed context ${command} help is missing ${option}.`);
    }
  }
  for (const command of [
    ...inspectionCommands,
    "commit-changes",
    "commit-read",
    "journals",
    "review-state",
    "review-context-state",
    "record-review-state",
    "save-review",
  ]) {
    if (!installedContextHelp.includes(command)) {
      throw new Error(`Installed context help is missing ${command}.`);
    }
  }
  if (!installedContextHelp.includes("repository-wide recent journals")) {
    throw new Error("Installed context help has stale journal selection guidance.");
  }
  const installedJournalHelp = runInstalled(
    installedBin,
    ["context", "journals", "--help"],
    consumer,
  );
  if (
    !installedJournalHelp.includes("Usage: ccr context journals [options] [pull-request]") ||
    !installedJournalHelp.includes("except the active entry")
  ) {
    throw new Error("Installed journal help has stale compatibility or recency guidance.");
  }
  for (const versionFlag of ["-v", "-version", "--version", "-V"]) {
    const installedVersion = runInstalled(installedBin, [versionFlag], consumer).trim();
    if (installedVersion !== packageJson.version) {
      throw new Error(
        `Installed CLI ${versionFlag} output ${installedVersion} does not match package ${packageJson.version}.`,
      );
    }
  }
  const esmSdkCheckPath = path.join(consumer, "verify-sdk.mjs");
  writeFileSync(
    esmSdkCheckPath,
    `import { readFile, writeFile } from "node:fs/promises";
import { createAsuAimlProviderConfig } from "@vctrx/ccr";
import { DEFAULT_CONTEXT_CONFIG, resolveContextConfig } from "@vctrx/ccr/context";
import { parseReviewDimensionRegistry, readReviewDimensionRegistry, renderReviewDimensionSections } from "@vctrx/ccr/review";
import dimensionsJson from "@vctrx/ccr/dimensions.json" with { type: "json" };

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
const packaged = parseReviewDimensionRegistry(dimensionsJson);
const effective = await readReviewDimensionRegistry(process.cwd());
if (JSON.stringify(packaged) !== JSON.stringify(effective) || typeof renderReviewDimensionSections(registry) !== "string") {
  throw new Error("Installed taxonomy data or runtime SDK exports are incomplete.");
}
const asset = new URL(import.meta.resolve("@vctrx/ccr/dimensions.json"));
const original = await readFile(asset, "utf8");
try {
  await writeFile(asset, JSON.stringify(registry));
  const revised = await readReviewDimensionRegistry(process.cwd());
  if (JSON.stringify(revised) !== JSON.stringify(registry)) {
    throw new Error("Installed SDK cached package JSON instead of rereading it.");
  }
  await writeFile(asset, "invalid JSON");
  let rejected = false;
  try { await readReviewDimensionRegistry(process.cwd()); } catch { rejected = true; }
  if (!rejected) throw new Error("Invalid package JSON silently fell back to cached data.");
} finally {
  await writeFile(asset, original);
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

  // CommonJS eval/stdin expose a global __dirname that ESM dependencies must not mistake for
  // their own location. Check both bundled entry points from an installed consumer directory.
  const inlineSdkCheck = `
(async () => {
  const ccr = require("@vctrx/ccr");
  const expected = ccr.parseReviewDimensionRegistry(JSON.parse(require("node:fs").readFileSync(require.resolve("@vctrx/ccr/dimensions.json"), "utf8")));
  for (const entry of ["@vctrx/ccr", "@vctrx/ccr/review"]) {
    const { readReviewDimensionRegistry } = await import(entry);
    const registry = await readReviewDimensionRegistry(process.cwd());
    if (JSON.stringify(registry) !== JSON.stringify(expected)) {
      throw new Error("Inline ESM import did not read the installed package taxonomy.");
    }
  }
  const registry = await ccr.readReviewDimensionRegistry(process.cwd());
  if (JSON.stringify(registry) !== JSON.stringify(expected)) {
    throw new Error("Inline CommonJS require did not read the installed package taxonomy.");
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
`;
  execFileSync(process.execPath, ["-e", inlineSdkCheck], {
    cwd: consumer,
    windowsHide: true,
  });
  execFileSync(process.execPath, [], {
    cwd: consumer,
    input: inlineSdkCheck,
    windowsHide: true,
  });

  execFileSync("git", ["init", "--quiet"], { cwd: consumer, windowsHide: true });
  const preview = runInstalled(installedBin, ["setup", "--dry-run"], consumer);
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

  runInstalled(installedBin, ["config", "init"], scripted);
  const configManualPath = path.join(scripted, ".ccr", "config-manual.md");
  if (
    !existsSync(configManualPath) ||
    !readFileSync(configManualPath, "utf8").includes(configManualHeading) ||
    !readFileSync(configManualPath, "utf8").includes("hooks.checkBeforeCommit") ||
    !readFileSync(configManualPath, "utf8").includes("instructions.updateAgentsMd")
  ) {
    throw new Error("config init did not create the configuration manual.");
  }
  runInstalled(installedBin, ["setup"], scripted);
  const decisionsPath = path.join(scripted, ".ccr", "decisions.md");
  const installedConfig = JSON.parse(
    readFileSync(path.join(scripted, ".ccr", "config.json"), "utf8"),
  );
  if (!existsSync(decisionsPath) || readFileSync(decisionsPath, "utf8") !== "") {
    throw new Error("setup did not create an empty decisions document.");
  }
  if (
    installedConfig.instructions?.updateAgentsMd !== true ||
    installedConfig.context?.recentJournalEntries !== 1
  ) {
    throw new Error("Generated configuration did not use the documented defaults.");
  }
  for (const removed of [
    installedConfig.hooks?.autoUpdateContext,
    installedConfig.context?.maxCompactionPercent,
    installedConfig.instructions?.updateDecisionsMd,
  ]) {
    if (removed !== undefined) {
      throw new Error("Generated configuration still writes a setting that is fixed in code.");
    }
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
  const packagedReferencePath = path.join(
    consumer,
    "node_modules",
    packageJson.name,
    "dist",
    "review",
    "dimensions.md",
  );
  const expectedReference = renderReviewDimensionReference(reviewRegistry);
  if (
    !existsSync(packagedReferencePath) ||
    readFileSync(packagedReferencePath, "utf8") !== expectedReference ||
    readFileSync(dimensionsPath, "utf8") !== expectedReference
  ) {
    throw new Error(
      "Packaged and installed Markdown taxonomy must match the JSON-derived reference.",
    );
  }
  const taxonomyPath = path.join(scripted, ".ccr", "dimensions.json");
  const installedTaxonomy = JSON.parse(
    runInstalled(installedBin, ["context", "dimensions", "--json"], scripted),
  );
  const exportedTaxonomy = JSON.parse(
    readFileSync(
      path.join(consumer, "node_modules", packageJson.name, "dist", "review", "dimensions.json"),
      "utf8",
    ),
  );
  if (
    !existsSync(taxonomyPath) ||
    JSON.stringify(installedTaxonomy) !== JSON.stringify(reviewRegistry) ||
    JSON.stringify(exportedTaxonomy) !== JSON.stringify(reviewSource)
  ) {
    throw new Error("Installed JSON taxonomy does not match the shipped source of truth.");
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
  const updateOutput = runInstalled(installedBin, ["update"], scripted);
  if (
    !updateOutput.includes("CCR update is already current.") ||
    readFileSync(projectPath, "utf8") !== "# Team-owned project context\n" ||
    readFileSync(journalPath, "utf8") !== "# Local continuity\n"
  ) {
    throw new Error("package update did not preserve user-owned CCR context and local continuity.");
  }
  const customTaxonomy = JSON.stringify({ dimensions: [] });
  writeFileSync(taxonomyPath, customTaxonomy);
  runInstalled(installedBin, ["update"], scripted);
  if (
    readFileSync(taxonomyPath, "utf8") !== customTaxonomy ||
    JSON.parse(runInstalled(installedBin, ["context", "dimensions", "--json"], scripted)).dimensions
      .length !== 0
  ) {
    throw new Error("Package update replaced a customized taxonomy or ignored live JSON edits.");
  }

  process.stdout.write(
    `Package smoke passed (${pack.name}@${pack.version}, installed ${files.length} files).\n`,
  );
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
