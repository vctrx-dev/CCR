import { approveGitInventory } from "./approved-git-inventory";
import { parseContextConfig, parseLocalContextConfig, resolveContextConfig } from "./config";
import type { ContextConfig } from "./config";
import { assertSafeManagedPath, readBoundedUtf8TextIfExists } from "./files";
import { readHeadEntries, readIndexEntries, readStagedContextState } from "./git";
export {
  type FilteredPaths,
  filterExcludedPaths,
  hasControlCharacters,
} from "./path-privacy";
import type { FilteredPaths } from "./path-privacy";

/**
 * Shared privacy policy boundary. Features that list or expose repository paths must filter here
 * before reading content; extend this policy rather than creating a filter that can drift from it.
 */

const MAX_CONTEXT_CONFIG_CHARACTERS = 64_000;
const CONTEXT_CONFIG_PATHS = [".ccr/config.json", ".ccr/config.local.json"] as const;
type ContextConfigPath = (typeof CONTEXT_CONFIG_PATHS)[number];

/** Reads one known config file through the shared bounded, fatal UTF-8 filesystem boundary. */
export async function readContextConfigText(
  root: string,
  relativePath: ContextConfigPath,
): Promise<string | undefined> {
  const bounded = await readBoundedUtf8TextIfExists(
    await assertSafeManagedPath(root, relativePath),
    MAX_CONTEXT_CONFIG_CHARACTERS,
  );
  if (bounded === undefined) return undefined;
  if (bounded.isBinary) throw new Error(`${relativePath} is not valid UTF-8 text.`);
  if (bounded.isTruncated) {
    throw new Error(`${relativePath} exceeds ${MAX_CONTEXT_CONFIG_CHARACTERS} characters.`);
  }
  return bounded.content;
}

/** Resolves committed settings plus stricter local overrides. */
export async function readResolvedContextConfig(root: string): Promise<ContextConfig> {
  const sharedText = await readContextConfigText(root, ".ccr/config.json");
  if (sharedText === undefined) throw new Error(".ccr/config.json is missing.");
  const shared = parseContextConfig(sharedText);
  const localText = await readContextConfigText(root, ".ccr/config.local.json");
  const local = localText ? parseLocalContextConfig(localText) : {};
  return resolveContextConfig(shared, local);
}

/** Returns staged regular-file paths allowed by mandatory and configured privacy settings. */
export async function readSafeStagedPaths(root: string): Promise<FilteredPaths> {
  const config = await readResolvedContextConfig(root);
  const approved = approveGitInventory({
    baselineEntries: readHeadEntries(root),
    candidatePaths: readStagedContextState(root).stagedPaths,
    currentEntries: readIndexEntries(root),
    excludedPatterns: config.privacy.excludedPaths,
  });
  return { included: approved.included, excluded: approved.excluded };
}
