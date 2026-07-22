#!/usr/bin/env node

/**
 * AI AGENT INSTRUCTION: DO NOT MODIFY THIS FILE WITHOUT EXPLICIT APPROVAL.
 * This is the project's universal code quality + blast radius script.
 * It enforces architectural rules dynamically — no file lists to update.
 * Changes here affect every commit. Discuss with maintainers first.
 *
 * Usage:
 *   node scripts/audit.mjs                 # static audit
 *   node scripts/audit.mjs --blast         # blast radius: run affected tests
 *   node scripts/audit.mjs --blast --print # show mapping only, no test exec
 *   node scripts/audit.mjs --blast --all   # against all source files
 *
 * Error format (grep-friendly):
 *   [FAIL] <rule-id> <file>:<line> <message>
 *   NOTE: <how an AI agent should fix this>
 *
 * To find all failures: grep "\[FAIL\]" scripts/audit.mjs output
 * To find specific rule failures: grep "<rule-id>" <output>
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

// ─── Formatted Output ─────────────────────────────────────

function fail(ruleId, file, line, message, note) {
  console.error(`  [FAIL] ${ruleId} ${file}:${line}  ${message}`);
  if (note) console.error(`  NOTE: ${note}`);
  hasErrors = true;
}

function warn(ruleId, file, line, message, note) {
  console.warn(`  [WARN] ${ruleId} ${file}:${line}  ${message}`);
  if (note) console.warn(`  NOTE: ${note}`);
  hasWarnings = true;
}

// ─── Helpers ────────────────────────────────────────────────

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
  if (nonBlank > limit) {
    fail("LOC-001", rel, 1,
      `File exceeds ${limit} non-blank lines (has ${nonBlank}). Split into smaller files.`,
      `Extract functions/types into separate files under the same module. Each file = one concern. Move helpers to dedicated files. For types, split into shared/types/domain-specific files.`
    );
  }
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
    if (!hasDoc && !trimmed.includes("// biome-ignore")) {
      fail("DOCS-001", rel, i + 1,
        `Function "${name}()" is missing JSDoc comment. Every function must document what it does and why.`,
        `Add a JSDoc block before line ${i + 1} using this format:\n` +
        `  /**\n` +
        `   * One-line summary — what this function does.\n` +
        `   * Why it exists and any non-obvious design decisions.\n` +
        `   *\n` +
        `   * @param paramName - Describe valid values, nullability, side effects.\n` +
        `   * @returns Describe return value and when it could be null/undefined.\n` +
        `   */`
      );
    }
  }
}

function checkNoAny(rel, lines) {
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (isNonCode(lines[i]) || trimmed.includes("// biome-ignore")) continue;
    if (/: any[\s,;\n)]/.test(trimmed) || trimmed.endsWith(": any")) {
      fail("TS-001", rel, i + 1,
        `Type "any" is banned. Use "unknown" with type guards instead.`,
        `Replace \`: any\` with \`: unknown\` and narrow the type using type guards (typeof checks, instanceof, or custom type predicates). Read ${rel} around line ${i + 1}.`
      );
    }
  }
}

function checkNaming(rel, lines) {
  const base = rel.split("/").pop() || "";
  if (!base.endsWith(".d.ts") && !base.endsWith(".test.ts") && !base.endsWith(".spec.ts") && !isKebabCase(base)) {
    fail("NAMING-001", rel, 1,
      `File name "${base}" must be kebab-case (lowercase letters, hyphens).`,
      `Rename "${base}" to kebab-case: e.g., "my-component.ts" instead of "${base}". Use only lowercase letters a-z, digits 0-9, and hyphens.`
    );
  }

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (isNonCode(lines[i])) continue;
    const typeMatch = trimmed.match(/^(?:export\s+)?(?:type|interface)\s+(\w+)/);
    if (typeMatch) {
      const n = typeMatch[1];
      if (n !== "never" && !/^[A-Z]/.test(n)) {
        fail("NAMING-002", rel, i + 1,
          `Type/interface "${n}" must be PascalCase (starts with uppercase).`,
          `Rename "${n}" to "${n.charAt(0).toUpperCase() + n.slice(1)}". Types and interfaces always start with a capital letter.`
        );
      }
    }
    const funcMatch = trimmed.match(/^export\s+(?:async\s+)?function\s+(\w+)/);
    if (funcMatch) {
      const n = funcMatch[1];
      if (n !== n[0].toLowerCase() + n.slice(1) && !/^[A-Z][A-Z_0-9]+$/.test(n)) {
        fail("NAMING-003", rel, i + 1,
          `Exported function "${n}" must be camelCase (starts with lowercase).`,
          `Rename "${n}" to "${n.charAt(0).toLowerCase() + n.slice(1)}". Functions start with a lowercase letter. Exception: UPPER_CASE for module-level constants.`
        );
      }
    }
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
    fail("DEBUG-001", rel, i + 1,
      `console.${m[1]}() found. Use the project's logging module instead.`,
      `Replace console.${m[1]}() with the appropriate logger from src/log/. If adding new log output, add it to the log module rather than using console directly.`
    );
  }
}

function checkTodos(rel, lines) {
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const m = trimmed.match(/\b(TODO|FIXME|HACK|XXX)\b(?!\s*[:\(]?\s*#\d+)/);
    if (!m) continue;
    if (/[#@]\d+/.test(trimmed) || /github\.com\/.*\/issues\/\d+/.test(trimmed)) continue;
    if (trimmed.includes("// biome-ignore")) continue;
    fail("DEBUG-002", rel, i + 1,
      `${m[1]} without an issue reference. All TODOs must link to a GitHub issue.`,
      `Add issue reference: change to "${m[1]}(#123): your message" where 123 is the GitHub issue number. Example: "TODO(#42): implement retry logic".`
    );
  }
}

function checkTypeAssertions(rel, lines) {
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (isNonCode(lines[i]) || trimmed.includes("// biome-ignore")) continue;
    if (/^(import|export)\s/.test(trimmed) || trimmed.includes("catch (") || /as\s+const\b/.test(trimmed)) continue;
    const m = trimmed.match(/\bas\s+([A-Z][A-Za-z0-9_]+)\b/);
    if (m) {
      fail("TS-002", rel, i + 1,
        `Type assertion "as ${m[1]}" used. Use Zod parsing or type narrowing instead.`,
        `Replace \`expr as ${m[1]}\` with proper type narrowing. Options:\n` +
        `  1. Use Zod schema + .parse() for external data\n` +
        `  2. Add runtime type guard (typeof/instanceof check)\n` +
        `  3. Use discriminated union and switch narrowing\n` +
        `  Exception: \`as const\` assertions are allowed.`
      );
    }
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
    if (count > MAX_FUNC_PARAMS) {
      const n = trimmed.match(/(?:function|const)\s+(\w+)/)?.[1] || "anonymous";
      fail("CODE-001", rel, i + 1,
        `"${n}()" has ${count} parameters (limit ${MAX_FUNC_PARAMS}). Use an options object.`,
        `Refactor "${n}" to accept a single options object parameter instead of ${count} positional params.\n` +
        `  Before: function ${n}(a: string, b: number, c: boolean, d: Date, e: string[])\n` +
        `  After:  function ${n}(opts: { a: string; b: number; c: boolean; d: Date; e: string[] })`
      );
    }
  }
}

function checkDebugger(rel, lines) {
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (isNonCode(lines[i])) continue;
    if (/debugger/.test(trimmed)) {
      fail("DEBUG-003", rel, i + 1,
        `debugger statement found. Remove before committing.`,
        `Delete the debugger statement on line ${i + 1} of ${rel}. Debugger statements block CI and should never be committed.`
      );
    }
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
    if (!found) {
      const content = readFileSync(filePath, "utf-8").trim();
      if (content && content !== "export {};" && content !== "") {
        warn("TDD-001", rel, 1,
          `No test file found. Expected one of: ${candidates.join(", ")}`,
          `Create a test file at the first expected path above. Follow TDD: write a failing test first, then implement.\n` +
          `  Tests/$level/ directory mirrors src/ structure. Add describe("${rel.replace(/^src\//, "").replace(/\.ts$/, "")}") and it("should ...") blocks.`
        );
      }
    }
  }

  for (const level of ["unit", "integration", "e2e"]) {
    const levelDir = join(TESTS, level);
    if (!existsSync(levelDir)) {
      warn("TDD-002", level, 0, `Test level directory "tests/${level}/" is missing.`, `Create tests/${level}/ directory. Add at least one .test.ts file to start testing at this level.`);
      continue;
    }
    for (const filePath of findFiles(levelDir)) {
      const rel = relative(ROOT, filePath).replace(/\\/g, "/");
      const content = readFileSync(filePath, "utf-8");
      for (let i = 0; i < content.split("\n").length; i++) {
        const line = content.split("\n")[i].trim();
        const dm = line.match(/describe\(['"](.+?)['"]/);
        if (dm && dm[1].length < 2) {
          fail("TDD-003", rel, i + 1,
            `describe() label "${dm[1]}" is too short. Use descriptive test group names.`,
            `Change describe("${dm[1]}") to describe("ModuleOrFunctionName"). Use PascalCase for modules, camelCase for function names.`
          );
        }
        const im = line.match(/\b(it|test)\(['"](.+?)['"]/);
        if (im && im[2].length > 20 && !/^(should|does|handles|returns|throws|passes|fails|accepts|rejects|creates|builds|parses|validates|extracts|maps|filters|sorts|merges|splits|generates|converts|formats|logs|sends|receives|renders|updates|deletes|adds|removes|includes|excludes|resolves|emits|calls|wraps|unwraps|encodes|decodes)/i.test(im[2])) {
          warn("TDD-004", rel, i + 1,
            `it() description "${im[2]}" should start with "should".`,
            `Rename it("${im[2]}") to it("should ${im[2].charAt(0).toLowerCase() + im[2].slice(1)}"). Test descriptions should read like "should return X when Y".`
          );
        }
      }
    }
  }
}

function checkTestLevels() {
  for (const level of ["unit", "integration", "e2e"]) {
    const d = join(TESTS, level);
    if (!existsSync(d)) {
      warn("TDD-002", "project-root", 0, `tests/${level}/ directory does not exist.`, `Create tests/${level}/ to enable ${level}-level testing. Add a .gitkeep if not yet implemented.`);
      continue;
    }
    const files = findFiles(d).filter((f) => !f.endsWith(".gitkeep"));
    if (files.length === 0) {
      warn("TDD-005", `tests/${level}/`, 0,
        `${level} test directory exists but has no test files.`,
        `Add at least one test file in tests/${level}/. Tests at this level cover:\n` +
        `  unit → individual functions\n` +
        `  integration → combined functions, cross-module\n` +
        `  e2e → full workflows`
      );
    }
  }
}

// ─── Static Audit Entry ────────────────────────────────────

function runAudit() {
  console.log("\n  ── Static Audit ────────────────────────\n");
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

  console.log("\n  ── Blast Radius ────────────────────────\n");

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

console.log("\n  ╔═══════════════════════════════════════╗");
console.log("  ║   CCR Code Quality Audit             ║");
console.log("  ╚═══════════════════════════════════════╝");

if (isBlast) {
  const blastExit = runBlastRadius(flagPrint, flagAll);
  console.log("");
  process.exit(blastExit);
}

runAudit();

console.log("");

// Print AI-friendly summary
if (hasErrors) {
  console.error("  [SUMMARY] Audit FAILED. To find all failures, grep for:  \\[FAIL\\]");
  console.error("  [SUMMARY] To fix a specific rule type, grep for the rule ID (e.g., TS-001).");
  console.error("  [SUMMARY] Each [FAIL] line has a NOTE: explaining how to fix.");
  console.error("");
  // Print aggregated counts by rule type
  console.error("  [SUMMARY] Quick reference — error rule IDs:");
  console.error("    LOC-001    File too large — split into smaller files");
  console.error("    DOCS-001   Function missing JSDoc — add documentation block");
  console.error("    TS-001     Type \"any\" used — replace with \"unknown\"");
  console.error("    TS-002     Type assertion \"as X\" — use Zod/narrowing instead");
  console.error("    NAMING-001 File name not kebab-case — rename file");
  console.error("    NAMING-002 Type/interface not PascalCase — rename type");
  console.error("    NAMING-003 Exported function not camelCase — rename function");
  console.error("    DEBUG-001  console.X() found — use log module");
  console.error("    DEBUG-002  TODO/FIXME without issue ref — add #number");
  console.error("    DEBUG-003  debugger statement — remove it");
  console.error("    CODE-001   Too many function params — use options object");
  console.error("    TDD-003    describe() label too short — use descriptive name");
  console.error("");
  console.error("  ❌  Audit FAILED — fix errors above and re-stage.\n");
  process.exit(1);
}

if (hasWarnings) {
  console.warn("  [SUMMARY] Audit passed with warnings. Warning rule IDs:");
  console.warn("    TDD-001    Missing test file for source file");
  console.warn("    TDD-002    Test level directory missing");
  console.warn("    TDD-004    it() description should start with \"should\"");
  console.warn("    TDD-005    Test level directory empty");
  console.warn("");
  console.warn("  ⚠️   Audit passed with warnings.\n");
  process.exit(0);
}

console.log("  ✅  All checks passed.\n");
process.exit(0);
