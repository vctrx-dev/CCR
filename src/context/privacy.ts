import { readFile } from "node:fs/promises";
import picomatch from "picomatch";
import { parseContextConfig, parseLocalContextConfig, resolveContextConfig } from "./config";
import type { ContextConfig } from "./config";
import { assertSafeManagedPath, readTextIfExists } from "./files";
import { readHeadEntries, readIndexEntries, readStagedContextState } from "./git";

/**
 * Shared privacy policy boundary. Features that list or expose repository paths must filter here
 * before reading content; extend this policy rather than creating a filter that can drift from it.
 */

const MANDATORY_EXCLUDED_PATHS = [
  ".ccr/config.local.json",
  ".ccr/{journal,private,cache,tmp}/**",
  ".claude/settings.local.json",
  ".claude/worktrees/**",
  ".env*",
  "**/.env*",
  ".npmrc",
  "**/.npmrc",
  ".pypirc",
  ".netrc",
  "**/*.{pem,key,p12,pfx,jks,keystore}",
  "**/{id_rsa,id_dsa,id_ecdsa,id_ed25519,credentials.json,service-account*.json}",
  "**/*.response.*",
  "**/secrets/**",
] as const;

export interface FilteredPaths {
  included: string[];
  excluded: string[];
}

/** Detects filename control characters that could forge terminal or JSON-list structure. */
export function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

/** Splits paths using configured globs before any excluded content is read or sent to Claude. */
export function filterExcludedPaths(paths: string[], patterns: string[]): FilteredPaths {
  const isExcluded = picomatch([...MANDATORY_EXCLUDED_PATHS, ...patterns], {
    dot: true,
    nocase: true,
  });
  const result: FilteredPaths = { included: [], excluded: [] };
  for (const candidate of paths) {
    const normalized = candidate.replaceAll("\\", "/");
    result[
      hasControlCharacters(normalized) || isExcluded(normalized) ? "excluded" : "included"
    ].push(candidate);
  }
  return result;
}

/** Resolves committed settings plus stricter local overrides. */
export async function readResolvedContextConfig(root: string): Promise<ContextConfig> {
  const sharedPath = await assertSafeManagedPath(root, ".ccr/config.json");
  const localPath = await assertSafeManagedPath(root, ".ccr/config.local.json");
  const shared = parseContextConfig(await readFile(sharedPath, "utf8"));
  const localText = await readTextIfExists(localPath);
  const local = localText ? parseLocalContextConfig(localText) : {};
  return resolveContextConfig(shared, local);
}

/** Returns staged regular-file paths allowed by mandatory and configured privacy settings. */
export async function readSafeStagedPaths(root: string): Promise<FilteredPaths> {
  const config = await readResolvedContextConfig(root);
  const filtered = filterExcludedPaths(
    readStagedContextState(root).stagedPaths,
    config.privacy.excludedPaths,
  );
  const unsafeIndexPaths = new Set(
    [...readIndexEntries(root), ...readHeadEntries(root)]
      .filter((entry) => !entry.mode.startsWith("100"))
      .map((entry) => entry.path),
  );
  const included = filtered.included.filter((candidate) => !unsafeIndexPaths.has(candidate));
  return {
    included,
    excluded: [
      ...filtered.excluded,
      ...filtered.included.filter((candidate) => unsafeIndexPaths.has(candidate)),
    ],
  };
}
