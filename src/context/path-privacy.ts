import picomatch from "picomatch";

/**
 * Pure repository-path privacy policy. Inventory builders apply this policy before any candidate
 * content is read; configuration and Git access remain outside this module.
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

/** Splits paths using mandatory and configured globs before excluded content is read. */
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
