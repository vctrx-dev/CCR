import { CCR_SKILLS, MANAGED_SKILL_MARKER } from "./skills";
import { CONTEXT_FILES } from "./templates";

/**
 * Reusable registry for every generated CCR artifact. Add new integrations here (and a skill
 * definition in `skills.ts` when applicable) instead of adding setup or uninstall special cases.
 */

/** Identifies an artifact's purpose for reporting and future feature selection. */
export type ManagedArtifactKind = "config" | "context" | "skill";
/** Controls how setup treats an artifact that already exists. */
export type SetupPolicy = "create-only" | "preserve-existing" | "upgrade-if-marked";
/** Controls the bounded condition under which uninstall may remove an artifact. */
export type UninstallPolicy = "preserve" | "remove-if-marked" | "remove-with-context";

/** Defines one generated file and its setup and uninstall lifecycle. */
export interface ManagedArtifact {
  content: string;
  kind: ManagedArtifactKind;
  path: string;
  setupPolicy: SetupPolicy;
  uninstallPolicy: UninstallPolicy;
}

const contextArtifacts: readonly ManagedArtifact[] = Object.entries(CONTEXT_FILES).map(
  ([path, content]) => ({
    content,
    kind: path === ".ccr/config.json" ? "config" : "context",
    path,
    setupPolicy: path === ".ccr/config.json" ? "preserve-existing" : "create-only",
    uninstallPolicy: "remove-with-context",
  }),
);

/**
 * Single installation inventory for all generated context and package-managed skills.
 * Future skills only need a definition in `skills.ts`; setup and uninstall derive from this list.
 */
export const MANAGED_ARTIFACTS: readonly ManagedArtifact[] = [
  ...contextArtifacts,
  ...CCR_SKILLS.map(({ content, path }) => ({
    content,
    kind: "skill" as const,
    path,
    setupPolicy: "upgrade-if-marked" as const,
    uninstallPolicy: "remove-if-marked" as const,
  })),
];

/** Returns whether a skill carries CCR's exact package-owned update marker. */
export function isPackageManagedSkill(content: string): boolean {
  return content.split(MANAGED_SKILL_MARKER).length === 2;
}
