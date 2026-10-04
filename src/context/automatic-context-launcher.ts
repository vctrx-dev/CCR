import { spawn } from "node:child_process";
import {
  assertSafeManagedPath,
  deleteManagedTextIfUnchanged,
  readBoundedUtf8TextIfExists,
  writeManagedText,
} from "./files";

/**
 * Background boundary for post-commit context updates. The hook starts a detached CCR process and
 * returns at once; a failed run leaves one small local marker that the next hook reports once.
 */

const FAILURE_PATH = ".ccr/private/auto-update-failed.json";

/** Starts `ccr hooks auto-update` detached from the hook; returns false when it cannot start. */
export function launchAutomaticContextUpdate(
  root: string,
  commit: string,
  journalPath: string,
  cliPath: string | undefined = process.argv[1],
): boolean {
  if (cliPath === undefined || cliPath.length === 0) return false;
  try {
    const child = spawn(process.execPath, [cliPath, "hooks", "auto-update", commit, journalPath], {
      cwd: root,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.on("error", () => undefined);
    child.unref();
    return true;
  } catch {
    return false;
  }
}

/** Records that the background update for one commit failed, for a one-line notice later. */
export async function recordAutomaticUpdateFailure(root: string, commit: string): Promise<void> {
  await writeManagedText(root, FAILURE_PATH, `${JSON.stringify({ commit })}\n`);
}

/** Returns whether a background failure is pending and clears it so it is reported only once. */
export async function takeAutomaticUpdateFailure(root: string): Promise<boolean> {
  try {
    const text = await readBoundedUtf8TextIfExists(
      await assertSafeManagedPath(root, FAILURE_PATH),
      1_000,
    );
    if (text === undefined) return false;
    await deleteManagedTextIfUnchanged(root, FAILURE_PATH, text.content);
    return true;
  } catch {
    return false;
  }
}
