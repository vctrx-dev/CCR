import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Shared repository filesystem boundary. New managed-file features must use these helpers so path
 * containment, symlink checks, and atomic writes stay consistent; generalize this code, do not bypass it.
 */

/** Returns whether a filesystem error represents an absent path. */
export function isFileNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/** Reads optional UTF-8 text without hiding errors other than a missing file. */
export async function readTextIfExists(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error: unknown) {
    if (isFileNotFound(error)) return undefined;
    throw error;
  }
}

/** Rejects absolute, escaping, or symlinked managed paths before repository writes/deletes. */
export async function assertSafeManagedPath(root: string, relativePath: string): Promise<string> {
  if (path.isAbsolute(relativePath)) throw new Error("Managed path must be repository-relative.");
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, relativePath);
  if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("Managed path escapes the repository.");
  }
  let current = resolvedRoot;
  for (const segment of path.relative(resolvedRoot, target).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      if ((await lstat(current)).isSymbolicLink()) {
        throw new Error(`Managed path crosses a symbolic link: ${relativePath}`);
      }
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") break;
      throw error;
    }
  }
  return target;
}

/** Replaces one text file atomically and removes its temporary file after a failed rename. */
export async function writeTextAtomic(target: string, content: string): Promise<void> {
  const temporary = `${target}.ccr-${process.pid}-${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content, "utf8");
    await rename(temporary, target);
  } catch (error: unknown) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

/** Creates parent directories and atomically writes one verified repository-relative file. */
export async function writeManagedText(
  root: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const target = await assertSafeManagedPath(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await assertSafeManagedPath(root, relativePath);
  await writeTextAtomic(target, content);
}

/** Safely reads an optional managed text file after containment and symlink checks. */
export async function readManagedTextIfExists(
  root: string,
  relativePath: string,
): Promise<string | undefined> {
  return readTextIfExists(await assertSafeManagedPath(root, relativePath));
}
