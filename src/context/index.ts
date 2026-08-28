/**
 * Supported context-management API. Use these registry-backed operations instead of reimplementing
 * managed-file, privacy, or lifecycle behavior in a consumer application. Export a new context
 * capability here only after its behavior and safety constraint are stable and documented.
 */

export type { PublicContextConfig, LocalContextConfig, ContextConfig } from "./config.js";
export {
  DEFAULT_CONTEXT_CONFIG,
  parseContextConfig,
  parseLocalContextConfig,
  resolveContextConfig,
  serializeContextConfig,
  toPublicContextConfig,
  updateContextConfig,
} from "./config.js";

export type { BoundedText } from "./files.js";
export {
  assertSafeManagedPath,
  isFileNotFound,
  readBoundedTextIfExists,
  readManagedTextIfExists,
  readTextIfExists,
  writeManagedText,
  writeTextAtomic,
} from "./files.js";

export type {
  ManagedArtifact,
  ManagedArtifactKind,
  ManagedBlockArtifact,
  ManagedSkillOwnership,
  RetiredManagedArtifact,
  SetupPolicy,
  UninstallPolicy,
} from "./managed-artifacts.js";
export {
  MANAGED_ARTIFACTS,
  MANAGED_BLOCK_ARTIFACTS,
  RETIRED_MANAGED_ARTIFACTS,
  isPackageManagedSkill,
  managedSkillOwnership,
} from "./managed-artifacts.js";

export type {
  ManagedBlock,
  ManagedBlockInspection,
  ManagedBlockRemovalOptions,
} from "./managed-block.js";
export {
  inspectManagedBlock,
  managedBlock,
  removeManagedBlock,
  upsertManagedBlock,
} from "./managed-block.js";

export type { ConfigSetupResult, SetupAction, SetupChange, SetupPreview } from "./setup.js";
export { applyConfigSetup, applySetup, previewSetup } from "./setup.js";

export type {
  UninstallModification,
  UninstallPreview,
  UninstallRemoval,
} from "./uninstall.js";
export { applyUninstall, previewUninstall } from "./uninstall.js";

export type { SafePathList, SafeRecentPaths } from "./broker.js";
export {
  listSafeRecentPaths,
  listSafeRepositoryPaths,
  readSafeRepositoryDiff,
  readSafeRepositoryFile,
  readSharedContextFile,
} from "./broker.js";
