import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_CONTEXT_CONFIG, parseContextConfig } from "./config";
import { assertSafeManagedPath } from "./files";
import { CONTEXT_FILES } from "./templates";

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
  ".ccr/architecture.md": "# Architecture",
  ".ccr/decisions.md": "# Human-approved Decisions",
};

async function readOptional(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
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
  return content.match(/\b(?:all|never|guaranteed)\b/iu)?.[0];
}

/** Validates committed CCR context without invoking an LLM or reading repository source. */
export async function validateContext(root: string): Promise<ValidationResult> {
  const issues: string[] = [];
  const configPath = await assertSafeManagedPath(root, ".ccr/config.json");
  const configText = await readOptional(configPath);
  let config = DEFAULT_CONTEXT_CONFIG;

  if (configText === undefined) {
    issues.push(".ccr/config.json is missing.");
  } else {
    try {
      config = parseContextConfig(configText);
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : "unknown validation error";
      issues.push(`.ccr/config.json is invalid: ${detail}`);
    }
  }

  for (const relativePath of Object.keys(CONTEXT_FILES).filter((file) => file.endsWith(".md"))) {
    const content = await readOptional(await assertSafeManagedPath(root, relativePath));
    if (content === undefined) {
      issues.push(`${relativePath} is missing.`);
      continue;
    }
    const limit =
      relativePath === ".ccr/index.md"
        ? config.context.maxIndexCharacters
        : config.context.maxFileCharacters;
    if (content.length > limit)
      issues.push(`${relativePath} exceeds its ${limit}-character limit.`);
    if (SECRET_PATTERNS.some((pattern) => pattern.test(content))) {
      issues.push(`${relativePath} contains secret-like content.`);
    }
    if (
      [".ccr/project.md", ".ccr/stakeholders.md", ".ccr/architecture.md"].includes(relativePath)
    ) {
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
