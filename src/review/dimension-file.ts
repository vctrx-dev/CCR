import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertSafeManagedPath, readBoundedUtf8TextIfExists } from "../context/files";
import {
  MAX_MANAGED_JSON_CHARACTERS,
  isUnmodifiedJsonArtifact,
  parseManagedJsonArtifact,
} from "../context/managed-json";
import { type ReviewDimensionRegistry, parseReviewDimensionRegistry } from "./dimensions";

/**
 * Live taxonomy boundary. Source JSON takes precedence; customized repository JSON and on-disk
 * package defaults are reread on every operation. No compiled registry is a runtime fallback.
 */
export const REVIEW_DIMENSIONS_PATH = ".ccr/dimensions.json";
export const REVIEW_DIMENSIONS_SOURCE_PATH = "src/review/dimensions.json";

async function readRegistryFile(root: string, relativePath: string) {
  const bounded = await readBoundedUtf8TextIfExists(
    await assertSafeManagedPath(root, relativePath),
    MAX_MANAGED_JSON_CHARACTERS,
  );
  if (bounded === undefined) return undefined;
  if (bounded.isTruncated)
    throw new Error("Review dimensions exceeded their safe character limit.");
  if (bounded.isBinary) throw new Error("Review dimensions must be valid UTF-8 text.");
  const { data } = parseManagedJsonArtifact(bounded.content);
  try {
    return { registry: parseReviewDimensionRegistry(data), content: bounded.content };
  } catch {
    // Schema errors can echo unknown keys or duplicate IDs; repository input is not a diagnostic.
    throw new Error(
      "Review dimensions are invalid: check required fields, unique IDs, and registry structure.",
    );
  }
}

/** Reads current package source when available, otherwise its shipped JSON, never bundled data. */
export async function readPackagedReviewDimensionRegistry(): Promise<ReviewDimensionRegistry> {
  // Bundles live in dist/ or dist/cli/; unbundled development modules live in src/review/.
  // Eval/stdin callers can expose a global __dirname even to ESM dependencies.
  const moduleDirectory =
    typeof import.meta.url === "string" ? fileURLToPath(new URL(".", import.meta.url)) : __dirname;
  for (const relative of [".", "..", "../.."]) {
    const packageRoot = path.resolve(moduleDirectory, relative);
    const metadata = await readBoundedUtf8TextIfExists(
      path.join(packageRoot, "package.json"),
      16_384,
    );
    if (!metadata || metadata.isTruncated || metadata.isBinary) continue;
    let isCcrPackage = false;
    try {
      isCcrPackage = JSON.parse(metadata.content).name === "@vctrx/ccr";
    } catch {
      throw new Error("CCR package metadata is invalid.");
    }
    if (!isCcrPackage) continue;
    const source = await readRegistryFile(packageRoot, REVIEW_DIMENSIONS_SOURCE_PATH);
    const packaged = source ?? (await readRegistryFile(packageRoot, "dist/review/dimensions.json"));
    if (packaged) return packaged.registry;
    throw new Error("CCR dimensions.json is missing; restore the package JSON before reviewing.");
  }
  throw new Error(
    "Cannot locate CCR's dimensions.json; restore the installation before reviewing.",
  );
}

/** Reads bounded live JSON; invalid or missing authoritative data never uses a cached registry. */
export async function readReviewDimensionRegistry(root: string): Promise<ReviewDimensionRegistry> {
  const source = await readRegistryFile(root, REVIEW_DIMENSIONS_SOURCE_PATH);
  if (source) return source.registry;
  const local = await readRegistryFile(root, REVIEW_DIMENSIONS_PATH);
  if (local && !isUnmodifiedJsonArtifact(local.content)) return local.registry;
  // An untouched setup copy tracks current package defaults instead of freezing an older version.
  return readPackagedReviewDimensionRegistry();
}
