import { access } from "node:fs/promises";
import path from "node:path";
import { readReviewDimensionRegistry } from "../review/dimension-file";
import { parseContextConfig } from "./config";
import { assertSafeManagedPath, readBoundedTextIfExists } from "./files";
import { readContextConfigText } from "./privacy";
import { CONTEXT_FILES } from "./templates";

/**
 * Reusable validation boundary for shared context. Add compatible document checks here so setup,
 * CLI, and future skills receive the same safety result rather than implementing local validation.
 */

export interface ValidationResult {
  isValid: boolean;
  issues: string[];
}

/** Reports content readiness separately from structural validity; populated is not fact-verified. */
export async function inspectContextReadiness(root: string) {
  const validation = await validateContext(root);
  const unfilledPaths: string[] = [];
  for (const relativePath of [".ccr/project.md", ".ccr/stakeholders.md"]) {
    const bounded = await readBoundedTextIfExists(
      await assertSafeManagedPath(root, relativePath),
      MAX_CONTEXT_VALIDATION_CHARACTERS,
    );
    const content = (bounded?.content ?? "").replaceAll("\r\n", "\n").trim();
    const template = (CONTEXT_FILES[relativePath] ?? "").trim();
    const prose = content
      .replace(/^#+[^\n]*$/gmu, "")
      .replace(/<!--[\s\S]*?-->/gu, "")
      .trim();
    if (content === template || prose.length === 0) unfilledPaths.push(relativePath);
  }
  return {
    ...validation,
    readiness: !validation.isValid
      ? "invalid"
      : unfilledPaths.length > 0
        ? "unfilled"
        : "populated",
    unfilledPaths,
  };
}

const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[opsu]_[A-Za-z0-9]{20,}\b/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
];

const REQUIRED_HEADINGS: Readonly<Record<string, string>> = {
  ".ccr/project.md": "# Project",
  ".ccr/stakeholders.md": "# Stakeholders",
};

/**
 * Shared Markdown is human-editable and untrusted. Keep validation on this bounded inspection path;
 * an oversized document must remain invalid rather than reintroducing a full-file read here.
 */
const MAX_CONTEXT_VALIDATION_CHARACTERS = 10_000;

function contextInspectionLimitIssue(relativePath: string): string {
  if (relativePath === ".ccr/stakeholders.md") {
    return `${relativePath} exceeds its ${MAX_CONTEXT_VALIDATION_CHARACTERS}-character limit.`;
  }
  return `${relativePath} exceeds the ${MAX_CONTEXT_VALIDATION_CHARACTERS}-character validation inspection limit; shorten it before validation.`;
}

function referencedPaths(content: string): string[] {
  const references = new Set<string>();
  const codeSpan = /`([^`\r\n]+)`/g;
  for (const match of content.matchAll(codeSpan)) {
    const value = match[1];
    if (
      !value ||
      (!value.includes("/") && !value.includes("\\")) ||
      /\s|[<>{}|*]/.test(value) ||
      value.startsWith("http") ||
      value.startsWith("/")
    ) {
      continue;
    }
    const withoutSymbol = value.split("#")[0]?.replace(/:\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*$/u, "");
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

/** Validates committed CCR context without invoking an LLM or reading repository source. */
export async function validateContext(root: string): Promise<ValidationResult> {
  const issues: string[] = [];
  try {
    const configText = await readContextConfigText(root, ".ccr/config.json");
    if (configText === undefined) {
      issues.push(".ccr/config.json is missing.");
    } else {
      parseContextConfig(configText);
    }
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : "unknown validation error";
    issues.push(`.ccr/config.json is invalid: ${detail}`);
  }
  try {
    await readReviewDimensionRegistry(root);
  } catch {
    issues.push(
      ".ccr/dimensions.json is invalid; use ccr context dimensions to inspect validation details.",
    );
  }

  for (const relativePath of Object.keys(CONTEXT_FILES).filter((file) => file.endsWith(".md"))) {
    const boundedContent = await readBoundedTextIfExists(
      await assertSafeManagedPath(root, relativePath),
      MAX_CONTEXT_VALIDATION_CHARACTERS,
    );
    if (boundedContent === undefined) {
      issues.push(`${relativePath} is missing.`);
      continue;
    }
    if (boundedContent.isTruncated) {
      issues.push(contextInspectionLimitIssue(relativePath));
      continue;
    }
    const content = boundedContent.content;
    if (SECRET_PATTERNS.some((pattern) => pattern.test(content))) {
      issues.push(`${relativePath} contains secret-like content.`);
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
