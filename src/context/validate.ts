import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { parseContextConfig } from "./config";
import { assertSafeManagedPath, readTextIfExists } from "./files";
import { CONTEXT_FILES } from "./templates";

/**
 * Reusable validation boundary for shared context. Add compatible document checks here so setup,
 * CLI, and future skills receive the same safety result rather than implementing local validation.
 */

export interface ValidationResult {
  isValid: boolean;
  issues: string[];
}

const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[opsu]_[A-Za-z0-9]{20,}\b/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
];

const REQUIRED_HEADINGS: Readonly<Record<string, string>> = {
  ".ccr/index.md": "# CCR Context",
  ".ccr/project.md": "# Project",
  ".ccr/stakeholders.md": "# Stakeholders",
};

const MAX_INDEX_CHARACTERS = 6000;
const MAX_CONTEXT_FILE_CHARACTERS = 10_000;

function referencedPaths(content: string): string[] {
  const references = new Set<string>();
  const codeSpan = /`([^`\r\n]+)`/g;
  for (const match of content.matchAll(codeSpan)) {
    const value = match[1];
    if (
      !value ||
      (!value.includes("/") && !value.includes("\\")) ||
      /\s|[<>{}|*]/.test(value) ||
      value.startsWith("http")
    ) {
      continue;
    }
    const withoutSymbol = value.split("#")[0]?.replace(/:\d+$/, "");
    if (withoutSymbol) {
      references.add(withoutSymbol.startsWith("@/") ? withoutSymbol.slice(2) : withoutSymbol);
    }
  }
  return [...references];
}

function linkedRoutes(content: string): string[] {
  return [...content.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)/gu)]
    .map((match) => match[1]?.replace(/^<|>$/g, "").split("#")[0])
    .filter((route): route is string => Boolean(route) && !/^[a-z][a-z+.-]*:/iu.test(route));
}

function isUnsafeReference(reference: string): boolean {
  const normalized = reference.replaceAll("\\", "/");
  return (
    path.posix.isAbsolute(normalized) ||
    path.win32.isAbsolute(reference) ||
    normalized.split("/").includes("..")
  );
}

function absoluteClaim(content: string): string | undefined {
  const proseOnly = content.replace(/```[\s\S]*?```/gu, "").replace(/`[^`\r\n]*`/gu, "");
  return proseOnly.match(/\b(?:all|never|guaranteed)\b/iu)?.[0];
}

/** Validates committed CCR context without invoking an LLM or reading repository source. */
export async function validateContext(root: string): Promise<ValidationResult> {
  const issues: string[] = [];
  const configPath = await assertSafeManagedPath(root, ".ccr/config.json");
  const configText = await readTextIfExists(configPath);
  if (configText === undefined) {
    issues.push(".ccr/config.json is missing.");
  } else {
    try {
      parseContextConfig(configText);
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : "unknown validation error";
      issues.push(`.ccr/config.json is invalid: ${detail}`);
    }
  }

  for (const relativePath of Object.keys(CONTEXT_FILES).filter((file) => file.endsWith(".md"))) {
    const content = await readTextIfExists(await assertSafeManagedPath(root, relativePath));
    if (content === undefined) {
      issues.push(`${relativePath} is missing.`);
      continue;
    }
    const limit =
      relativePath === ".ccr/index.md" ? MAX_INDEX_CHARACTERS : MAX_CONTEXT_FILE_CHARACTERS;
    if (content.length > limit)
      issues.push(`${relativePath} exceeds its ${limit}-character limit.`);
    if (SECRET_PATTERNS.some((pattern) => pattern.test(content))) {
      issues.push(`${relativePath} contains secret-like content.`);
    }
    if ([".ccr/project.md", ".ccr/stakeholders.md"].includes(relativePath)) {
      const absolute = absoluteClaim(content);
      if (absolute) {
        issues.push(
          `${relativePath} contains an absolute claim (${absolute}); reword or prove it.`,
        );
      }
    }
    const requiredHeading = REQUIRED_HEADINGS[relativePath];
    if (requiredHeading && !content.includes(requiredHeading)) {
      issues.push(`${relativePath} is missing required heading: ${requiredHeading}`);
    }
    for (const route of linkedRoutes(content)) {
      if (isUnsafeReference(route)) {
        issues.push(`${relativePath} contains an unsafe route: ${route}`);
        continue;
      }
      const routeTarget = path.join(root, path.dirname(relativePath), route.replaceAll("\\", "/"));
      try {
        await access(routeTarget);
      } catch {
        issues.push(`${relativePath} references a missing route: ${route}`);
      }
    }
    for (const reference of referencedPaths(content)) {
      if (isUnsafeReference(reference)) {
        issues.push(`${relativePath} contains an unsafe path reference: ${reference}`);
        continue;
      }
      try {
        await access(path.join(root, reference.replaceAll("\\", "/")));
      } catch {
        issues.push(`${relativePath} references a missing path: ${reference}`);
      }
    }
  }

  return { isValid: issues.length === 0, issues };
}
