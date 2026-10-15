import path from "node:path";
import { fileURLToPath } from "node:url";
import packageJson from "../../package.json";
import { readPackagedReviewDimensionRegistry } from "../review/dimension-file";
import { readBoundedUtf8TextIfExists } from "./files";
import type { ManagedArtifact } from "./managed-artifacts";

export const RUNTIME_ROOT = ".ccr/private/runtime";
export const RUNTIME_CLI_PATH = `${RUNTIME_ROOT}/dist/cli/index.cjs`;
const MAX_RUNTIME_CHARACTERS = 5_000_000;

/** Lifecycle inventory remains available to uninstall without reading the source installation. */
export const RUNTIME_ARTIFACTS: readonly ManagedArtifact[] = [
  RUNTIME_CLI_PATH,
  `${RUNTIME_ROOT}/package.json`,
  `${RUNTIME_ROOT}/dist/review/dimensions.json`,
].map((path) => ({
  path,
  content: "",
  kind: "runtime",
  setupPolicy: "replace-runtime",
  uninstallPolicy: "remove-with-context",
  maximumCharacters: MAX_RUNTIME_CHARACTERS,
}));

/** SDK setup uses the shipped CLI too; unbundled source callers can supply a test bundle. */
export async function readPackagedRuntimeSourcePath(
  modulePath: string = typeof import.meta.url === "string"
    ? fileURLToPath(import.meta.url)
    : __filename,
): Promise<string | undefined> {
  if (path.extname(modulePath) === ".ts") return undefined;
  for (const relative of [".", "..", "../.."]) {
    const packageRoot = path.resolve(path.dirname(modulePath), relative);
    const metadata = await readBoundedUtf8TextIfExists(
      path.join(packageRoot, "package.json"),
      16_384,
    );
    if (!metadata || metadata.isBinary || metadata.isTruncated) continue;
    if (JSON.parse(metadata.content).name === packageJson.name) {
      return path.join(packageRoot, "dist/cli/index.cjs");
    }
  }
  throw new Error("Cannot locate CCR's bundled runtime in the local setup resources.");
}

/** Retains the self-contained CLI before an npx cache or temporary installation disappears. */
export async function readRuntimeArtifacts(cliPath: string): Promise<ManagedArtifact[]> {
  const cli = await readBoundedUtf8TextIfExists(cliPath, MAX_RUNTIME_CHARACTERS);
  if (!cli || cli.isBinary || cli.isTruncated || !cli.content.startsWith("#!/usr/bin/env node")) {
    throw new Error("CCR setup could not read its bundled runtime from the local setup resources.");
  }
  const dimensions = await readPackagedReviewDimensionRegistry();
  const contents: Record<string, string> = {
    [RUNTIME_CLI_PATH]: cli.content,
    [`${RUNTIME_ROOT}/package.json`]: `${JSON.stringify({ name: packageJson.name, version: packageJson.version, private: true })}\n`,
    [`${RUNTIME_ROOT}/dist/review/dimensions.json`]: `${JSON.stringify(dimensions, null, 2)}\n`,
  };
  return RUNTIME_ARTIFACTS.map((artifact) => ({ ...artifact, content: contents[artifact.path] }));
}
