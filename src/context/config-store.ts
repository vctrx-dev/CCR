import { setTimeout as delay } from "node:timers/promises";
import { type ContextConfig, parseContextConfig, serializeContextConfig } from "./config";
import {
  MANAGED_LIFECYCLE_LOCK_PATH,
  readManagedTextIfExists,
  withManagedLock,
  writeManagedTextIfUnchanged,
} from "./files";

/**
 * Persistence boundary for the human-owned CCR configuration. Commands and workflows supply pure
 * transformations; this module owns lifecycle exclusion, reload, validation, and CAS retry.
 */

const CONFIG_PATH = ".ccr/config.json";
const MAX_CONFIG_WRITE_ATTEMPTS = 50;
const CONFIG_RETRY_MILLISECONDS = 5;

export interface ConfigMutationResult {
  config: ContextConfig;
  isChanged: boolean;
}

/** Reads and validates the current stored configuration. */
export async function readStoredContextConfig(root: string): Promise<ContextConfig> {
  const content = await readManagedTextIfExists(root, CONFIG_PATH);
  if (content === undefined) throw new Error(`CCR configuration does not exist: ${CONFIG_PATH}.`);
  return parseContextConfig(content);
}

/** Applies one pure transformation without overwriting a concurrent configuration update. */
export async function updateStoredContextConfig(
  root: string,
  update: (config: ContextConfig) => ContextConfig,
): Promise<ConfigMutationResult> {
  return withManagedLock(
    root,
    MANAGED_LIFECYCLE_LOCK_PATH,
    {
      busyMessage: "CCR managed lifecycle is busy; retry the update.",
      maximumAttempts: MAX_CONFIG_WRITE_ATTEMPTS,
      retryMilliseconds: CONFIG_RETRY_MILLISECONDS,
    },
    async () => {
      for (let attempt = 0; attempt < MAX_CONFIG_WRITE_ATTEMPTS; attempt += 1) {
        const content = await readManagedTextIfExists(root, CONFIG_PATH);
        if (content === undefined) {
          throw new Error(`CCR configuration does not exist: ${CONFIG_PATH}.`);
        }
        const updated = update(parseContextConfig(content));
        const updatedContent = serializeContextConfig(updated);
        if (updatedContent === content) return { config: updated, isChanged: false };
        if (await writeManagedTextIfUnchanged(root, CONFIG_PATH, content, updatedContent)) {
          return { config: updated, isChanged: true };
        }
        await delay(CONFIG_RETRY_MILLISECONDS);
      }
      throw new Error("CCR configuration remained busy; retry the update.");
    },
  );
}
