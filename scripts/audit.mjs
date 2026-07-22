#!/usr/bin/env node

/**
 * AI AGENT INSTRUCTION: DO NOT MODIFY THIS FILE WITHOUT EXPLICIT APPROVAL.
 * This is the project's universal code quality + blast radius script.
 * It enforces architectural rules dynamically — no file lists to update.
 * Changes here affect every commit. Discuss with maintainers first.
 *
 * Usage:
 *   node scripts/audit.mjs               # static audit (LOC, docs, naming, types, TODOs)
 *   node scripts/audit.mjs --blast       # blast radius: run tests affected by changed files
 *   node scripts/audit.mjs --blast --print  # blast radius: show mapping only, no test exec
 *   node scripts/audit.mjs --blast --all    # blast radius: against all source files
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(ROOT, "src");
const TESTS = resolve(ROOT, "tests");

const EXCLUDE_DIRS = new Set(["node_modules", ".git", "dist", "coverage", ".husky"]);
const MAX_LOC_DEFAULT = 700;
const MAX_LOC_TYPES = 1000;
const MAX_LOC_TESTS = 500;
const MAX_FUNC_PARAMS = 4;

let hasErrors = false;
let hasWarnings = false;

// ─── Helpers ────────────────────────────────────────────────

function err(file, line, message) {
  console.error(`  ERROR   ${file}:${line}  ${message}`);
  hasErrors = true;
}

function warn(file, line, message) {
  console.warn(`  WARN    ${file}:${line}  ${message}`);
  hasWarnings = true;
}

function findFiles(dir, extRe = /\.(ts|tsx|mts)$/i) {
  const files = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (EXCLUDE_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) files.push(...findFiles(full, extRe));
      else if (entry.isFile() && extRe.test(entry.name)) files.push(full);
    }
  } catch { /* skip unreadable */ }
  return files;
}

function isKebabCase(name) {
  return /^[a-z][a-z0-9]*(-[a-z][a-z0-9]*)*(\.[a-z][a-z0-9]*)*$/.test(name);
}

function isNonCode(line) {
  const t = line.trim();
  return t === "" || t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith('"use ') || t.startsWith("'use ");
}

function sourceToTestPaths(srcRel) {
  const base = srcRel.replace(/^src\//, "").replace(/\.tsx?$/, "");
  return ["unit", "integration", "e2e"].map((l) => `tests/${l}/${base}.test.ts`);
}

function run(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: "utf-8" }).trim();
  } catch { return ""; }
}

// ─── Static Audit ──────────────────────────────────────────

function checkLoc(rel, lines) {
  const isTypes = rel.includes("/types") || rel.endsWith(".types.ts") || rel.endsWith(".types.tsx");
  const isTests = rel.startsWith("tests/");
  const limit = isTypes ? MAX_LOC_TYPES : isTests ? MAX_LOC_TESTS : MAX_LOC_DEFAULT;
  const nonBlank = lines.filter((l) => l.trim() !== "").length;
  if (nonBlank > limit)
    err(rel, 1, `File has ${nonBlank} non-blank lines (limit ${limit}). Split into smaller files.`);
}

function checkFunctionDocs(rel, lines) {
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const funcMatch = trimmed.match(/^(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z_$]\w*)\s*\(/);
    const arrowMatch = trimmed.match(/^(?:export\s+)?(?:const|let|var)\s+([a-zA-Z_$]\w*)\s*=\s*(?:async\s+)?(?:\(|function)/);
    const name = funcMatch?.[1] || arrowMatch?.[1];
    if (!name || name === "constructor" || name === "render" || name.startsWith("it") || name.startsWith("test") || name.startsWith("describe")) continue;

    let j = i - 1, hasDoc = false;
    while (j >= 0) {
      const prev = lines[j].trim();
      if (prev === "" || prev.startsWith("//") || prev.startsWith("@")) { j--; continue; }
      if (prev.endsWith("*/")) { hasDoc = true; break; }
      break;
    }
    if (!hasDoc && !trimmed.includes("// biome-ignore"))
      err(rel, i + 1, `Function "${name}()" is missing JSDoc. Document what it does, why, and what it returns.`);
  }
}

function checkNoAny(rel, lines) {
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (isNonCode(lines[i]) || trimmed.includes("// biome-ignore")) continue;
    if (/: any[\s,;\n)]/.test(trimmed) || trimmed.endsWith(": any"))
      err(rel, i + 1, `Type "any" is banned. Use "unknown" and narrow with type guards.`);
  }
}

function checkNaming(rel, lines) {
  const base = rel.split("/").pop() || "";
  if (!base.endsWith(".d.ts") && !base.endsWith(".test.ts") && !base.endsWith(".spec.ts") && !isKebabCase(base))
    err(rel, 1, `File name "${base}" must be kebab-case (e.g., my-component.ts).`);

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (isNonCode(lines[i])) continue;
    const typeMatch = trimmed.match(/^(?:export\s+)?(?:type|interface)\s+(\w+)/);
    if (typeMatch) { const n = typeMatch[1]; if (n !== "never" && !/^[A-Z]/.test(n)) err(rel, i + 1, `Type/interface "${n}" must be PascalCase.`); }
    const funcMatch = trimmed.match(/^export\s+(?:async\s+)?function\s+(\w+)/);
    if (funcMatch) { const n = funcMatch[1]; if (n !== n[0].toLowerCase() + n.slice(1) && !/^[A-Z][A-Z_0-9]+$/.test(n)) err(rel, i + 1, `Exported function "${n}" must be camelCase.`); }
  }
}

function checkConsoleLog(rel, lines) {
  const isLogModule = rel.startsWith("src/log/");
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (isNonCode(lines[i])) continue;
    const m = trimmed.match(/console\.(log|warn|error|debug|info)\(/);
    if (!m) continue;
    if (isLogModule && m[1] !== "log") continue;
    err(rel, i + 1, `console.${m[1]}() found. Use the log module instead.`);
  }
}

function checkTodos(rel, lines) {
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const m = trimmed.match(/\b(TODO|FIXME|HACK|XXX)\b(?!\s*[:\(]?\s*#\d+)/);
    if (!m) continue;
    if (/[#@]\d+/.test(trimmed) || /github\.com\/.*\/issues\/\d+/.test(trimmed)) continue;
    if (trimmed.includes("// biome-ignore")) continue;
    err(rel, i + 1, `${m[1]} without issue reference. Use "TODO(#123): message" or link the issue.`);
  }
}

function checkTypeAssertions(rel, lines) {
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (isNonCode(lines[i]) || trimmed.includes("// biome-ignore")) continue;
    if (/^(import|export)\s/.test(trimmed) || trimmed.includes("catch (") || /as\s+const\b/.test(trimmed)) continue;
    const m = trimmed.match(/\bas\s+([A-Z][A-Za-z0-9_]+)\b/);
    if (m) err(rel, i + 1, `Type assertion "as ${m[1]}" — prefer type narrowing or Zod parsing.`);
  }
}

function checkMaxParams(rel, lines) {
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (isNonCode(lines[i])) continue;
    const isFunc = /^(?:export\s+)?(?:async\s+)?function\s+\w+\s*\(/.test(trimmed);
    const isArrow = /^(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?\(/.test(trimmed);
    if (!isFunc && !isArrow) continue;

    const start = trimmed.indexOf("("); let depth = 0, end = start;
    for (; end < trimmed.length; end++) {
      if (trimmed[end] === "(") depth++;
      else if (trimmed[end] === ")") { depth--; if (depth === 0) break; }
    }
    if (depth !== 0) continue;
    const params = trimmed.slice(start + 1, end).replace(/\([^)]*\)/g, "");
    if (params.trim() === "" || params.trim() === "_" || params.trim() === "void") continue;
    depth = 0; let count = 1;
    for (const ch of params) { if ("{[(".includes(ch)) depth++; else if ("}])".includes(ch)) depth--; else if (ch === "," && depth === 0) count++; }
    if (count > MAX_FUNC_PARAMS) { const n = trimmed.match(/(?:function|const)\s+(\w+)/)?.[1] || "anonymous"; err(rel, i + 1, `"${n}" has ${count} params (limit ${MAX_FUNC_PARAMS}). Use an options object.`); }
  }
}

function checkDebugger(rel, lines) {
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (isNonCode(lines[i])) continue;
    if (/debugger/.test(trimmed)) err(rel, i + 1, "debugger statement found. Remove before committing.");
  }
}

function checkTestFilesExist() {
  const srcFiles = findFiles(SRC);
  const testFiles = new Set(findFiles(TESTS).map((f) => relative(ROOT, f).replace(/\\/g, "/")));

  for (const filePath of srcFiles) {
    const rel = relative(ROOT, filePath).replace(/\\/g, "/");
    if (rel === "src/index.ts" || rel.endsWith("/index.ts")) continue;
    const candidates = sourceToTestPaths(rel);
    const found = candidates.some((c) => testFiles.has(c) || testFiles.has(c.replace(".test.ts", ".spec.ts")));
    if (!found) { const content = readFileSync(filePath, "utf-8").trim(); if (content && content !== "export {};" && content !== "") warn(rel, 1, `No test file found. Expected one of: ${candidates.join(", ")}`); }
  }

  for (const level of ["unit", "integration", "e2e"]) {
    const levelDir = join(TESTS, level);
    if (!existsSync(levelDir)) { warn(`tests/${level}/`, 1, `Test level directory missing.`); continue; }
    for (const filePath of findFiles(levelDir)) {
      const rel = relative(ROOT, filePath).replace(/\\/g, "/");
      const content = readFileSync(filePath, "utf-8");
      for (let i = 0; i < content.split("\n").length; i++) {
        const line = content.split("\n")[i].trim();
        const dm = line.match(/describe\(['"](.+?)['"]/);
        if (dm && dm[1].length < 2) err(rel, i + 1, `describe() label too short ("${dm[1]}").`);
        const im = line.match(/\b(it|test)\(['"](.+?)['"]/);
        if (im && im[2].length > 20 && !/^(should|does|handles|returns|throws|passes|fails|accepts|rejects|creates|builds|parses|validates|extracts|maps|filters|sorts|merges|splits|generates|converts|formats|logs|sends|receives|renders|updates|deletes|adds|removes|includes|excludes|resolves|emits|calls|wraps|unwraps|encodes|decodes)/i.test(im[2]))
          warn(rel, i + 1, `it() description should start with "should": "${im[2]}"`);
      }
    }
  }
}

function checkTestLevels() {
  for (const level of ["unit", "integration", "e2e"]) {
    const d = join(TESTS, level);
    if (!existsSync(d)) { warn("test-levels", 1, `tests/${level}/ does not exist.`); continue; }
    const files = findFiles(d).filter((f) => !f.endsWith(".gitkeep"));
    if (files.length === 0) warn("test-levels", 1, `tests/${level}/ has no test files yet.`);
  }
}

// ─── Static Audit Entry ────────────────────────────────────

function runAudit() {
  process.stdout.write("\n  ── Static Audit ────────────────────────\n\n");
  const srcFiles = findFiles(SRC);

  if (srcFiles.length === 0) {
    console.log("  No source files found in src/. Skipping.\n");
  } else {
    for (const filePath of srcFiles) {
      const rel = relative(ROOT, filePath).replace(/\\/g, "/");
      const lines = readFileSync(filePath, "utf-8").split("\n");
      checkNaming(rel, lines);
      checkLoc(rel, lines);
      checkFunctionDocs(rel, lines);
      checkNoAny(rel, lines);
      checkTypeAssertions(rel, lines);
      checkConsoleLog(rel, lines);
      checkTodos(rel, lines);
      checkMaxParams(rel, lines);
      checkDebugger(rel, lines);
    }
    checkTestFilesExist();
  }
  checkTestLevels();

  const allTestFiles = findFiles(TESTS);
  for (const filePath of allTestFiles) {
    const rel = relative(ROOT, filePath).replace(/\\/g, "/");
    const lines = readFileSync(filePath, "utf-8").split("\n");
    checkNaming(rel, lines);
    checkLoc(rel, lines);
    checkNoAny(rel, lines);
    checkConsoleLog(rel, lines);
    checkTodos(rel, lines);
    checkDebugger(rel, lines);
  }
}

// ─── Blast Radius ──────────────────────────────────────────

function findTestDirs(level) {
  const dir = join(TESTS, level);
  if (!existsSync(dir)) return [];
  const entries = [];
  function walk(d) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".spec.ts")) entries.push(relative(ROOT, full).replace(/\\/g, "/"));
    }
  }
  walk(dir);
  return entries;
}

function mapTests(changedFiles) {
  const plan = { unit: [], integration: [], e2e: [] };
  const seenInt = new Set();

  for (const file of changedFiles) {
    if (!file.startsWith("src/") || !file.endsWith(".ts") || file.endsWith(".d.ts")) continue;
    const base = file.replace(/^src\//, "").replace(/\.tsx?$/, "");

    const u = `tests/unit/${base}.test.ts`;
    if (existsSync(join(ROOT, u))) plan.unit.push(u);
    const s = `tests/unit/${base}.spec.ts`;
    if (existsSync(join(ROOT, s)) && !plan.unit.includes(s)) plan.unit.push(s);

    const moduleDir = base.split("/")[0];
    if (moduleDir && !seenInt.has(moduleDir)) {
      seenInt.add(moduleDir);
      // check if any integration tests exist for this module
      const intDir = join(TESTS, "integration", moduleDir);
      if (existsSync(intDir) && findFiles(intDir).length > 0) plan.integration.push(moduleDir);
    }
  }

  const e2eFiles = findTestDirs("e2e");
  if (e2eFiles.length > 0 && changedFiles.some((f) => f.startsWith("src/"))) plan.e2e = e2eFiles;

  return plan;
}

function getAllSourceFiles() {
  const files = [];
  function walk(d, prefix) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || EXCLUDE_DIRS.has(entry.name)) continue;
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = join(d, entry.name);
      if (entry.isDirectory()) walk(full, relPath);
      else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) files.push(relPath);
    }
  }
  walk(join(ROOT, "src"), "src");
  return files;
}

function runBlastRadius(flagPrint, flagAll) {
  const changedFiles = flagAll ? getAllSourceFiles() : [...new Set([
    ...run("git diff --name-only --cached").split("\n").filter(Boolean),
    ...run("git diff --name-only").split("\n").filter(Boolean),
    ...run("git ls-files --others --exclude-standard").split("\n").filter(Boolean),
  ])].filter((f) => f.startsWith("src/"));

  process.stdout.write("\n  ── Blast Radius ────────────────────────\n\n");

  if (changedFiles.length === 0) {
    console.log("  No changed source files detected.\n");
    return 0;
  }

  console.log(`  Changed files (${changedFiles.length}):`);
  for (const f of changedFiles) console.log(`    • ${f}`);

  const plan = mapTests(changedFiles);

  console.log("");
  for (const level of ["unit", "integration", "e2e"]) {
    const tests = level === "integration" ? plan.integration : plan[level];
    if (!tests || tests.length === 0) { console.log(`  ${level}: — no tests affected`); continue; }
    console.log(`  ${level}: ${tests.length > 10 ? `${tests.length} test(s)` : tests.length === 1 ? "1 test" : `${tests.length} tests`}`);
    for (const t of tests.slice(0, 10)) console.log(`    → ${t}`);
    if (tests.length > 10) console.log(`    … and ${tests.length - 10} more`);
  }

  if (flagPrint) return 0;

  // Run affected tests
  let exitCode = 0;

  console.log("\n  ─── Running affected tests ───\n");

  if (plan.unit.length > 0) {
    console.log(`  ▶  Running ${plan.unit.length} unit test(s)...`);
    try { const out = run(`npx vitest run ${plan.unit.join(" ")} --reporter=verbose`); console.log(out); } catch (e) { console.error(e.stdout || e.message); exitCode = 1; }
  }

  if (plan.integration.length > 0) {
    console.log(`  ▶  Running integration tests for ${plan.integration.length} module(s)...`);
    try { const out = run(`npx vitest run tests/integration --reporter=verbose`); console.log(out); } catch (e) { console.error(e.stdout || e.message); exitCode = 1; }
  }

  if (plan.e2e.length > 0) {
    console.log(`  ▶  Running ${plan.e2e.length} e2e test(s)...`);
    try { const out = run(`npx vitest run ${plan.e2e.join(" ")} --reporter=verbose`); console.log(out); } catch (e) { console.error(e.stdout || e.message); exitCode = 1; }
  }

  return exitCode;
}

// ─── Main ──────────────────────────────────────────────────

const isBlast = process.argv.includes("--blast");
const flagPrint = process.argv.includes("--print");
const flagAll = process.argv.includes("--all");

process.stdout.write("\n  ╔═══════════════════════════════════════╗\n");
process.stdout.write("  ║   CCR Code Quality Audit             ║\n");
process.stdout.write("  ╚═══════════════════════════════════════╝\n");

if (isBlast) {
  const blastExit = runBlastRadius(flagPrint, flagAll);
  process.stdout.write("\n");
  process.exit(blastExit);
}

runAudit();

process.stdout.write("\n");

if (hasErrors) { process.stdout.write("  ❌  Audit FAILED — fix errors above and re-stage.\n\n"); process.exit(1); }
if (hasWarnings) { process.stdout.write("  ⚠️   Audit passed with warnings.\n\n"); process.exit(0); }

process.stdout.write("  ✅  All checks passed.\n\n");
process.exit(0);
