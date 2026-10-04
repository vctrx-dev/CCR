import { REVIEW_DIMENSIONS_PATH, readReviewDimensionRegistry } from "../review/dimension-file";
import { REVIEW_DIMENSIONS, renderReviewDimensionReference } from "../review/dimensions";
import {
  MAX_MANAGED_JSON_CHARACTERS,
  isUnmodifiedJsonArtifact,
  serializeUpgradableJsonArtifact,
} from "./managed-json";
import { CCR_SKILL_RESOURCES } from "./skill-resources";
import { CCR_SKILLS, MANAGED_SKILL_MARKER } from "./skills";
import { CLAUDE_BLOCK, CONTEXT_FILES, IGNORE_BLOCK } from "./templates";

/**
 * Reusable registry for every generated CCR artifact. Add new integrations here (and a skill
 * definition in `skills.ts` when applicable) instead of adding setup or uninstall special cases.
 */

/** Identifies an artifact's purpose for reporting and future feature selection. */
export type ManagedArtifactKind = "config" | "context" | "skill";
/** Controls how setup treats an artifact that already exists. */
export type SetupPolicy =
  | "create-only"
  | "preserve-existing"
  | "upgrade-if-marked"
  | "upgrade-if-unmodified";
/** Controls the bounded condition under which uninstall may remove an artifact. */
export type UninstallPolicy = "preserve" | "remove-if-marked" | "remove-with-context";

/** Defines one generated file and its setup and uninstall lifecycle. */
export interface ManagedArtifact {
  content: string;
  kind: ManagedArtifactKind;
  path: string;
  setupPolicy: SetupPolicy;
  uninstallPolicy: UninstallPolicy;
  /** Upgrade predicate for payload-owned artifacts; absent predicates fail closed. */
  isUnmodified?: (content: string) => boolean;
  /** Optional bound honored throughout lifecycle previews and current-content checks. */
  maximumCharacters?: number;
}

export type BlockSetupCondition = "always" | "updateAgentsMd" | "updateClaudeMd";
export type BlockUninstallCondition = "always" | "without-local-state";

/** Defines one CCR-owned span inside an otherwise user-owned text file. */
export interface ManagedBlockArtifact {
  content: string;
  path: string;
  setupCondition: BlockSetupCondition;
  uninstallCondition: BlockUninstallCondition;
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
  {
    content: serializeUpgradableJsonArtifact(REVIEW_DIMENSIONS),
    kind: "context",
    path: REVIEW_DIMENSIONS_PATH,
    setupPolicy: "upgrade-if-unmodified",
    uninstallPolicy: "remove-with-context",
    isUnmodified: isUnmodifiedJsonArtifact,
    maximumCharacters: MAX_MANAGED_JSON_CHARACTERS,
  },
  ...[...CCR_SKILLS, ...CCR_SKILL_RESOURCES].map(({ content, path }) => ({
    content,
    kind: "skill" as const,
    path,
    setupPolicy: "upgrade-if-marked" as const,
    uninstallPolicy: "remove-if-marked" as const,
  })),
];

/** Resolves taxonomy-derived lifecycle content from the same live JSON used by reviews. */
export async function readManagedArtifacts(root: string): Promise<readonly ManagedArtifact[]> {
  const registry = await readReviewDimensionRegistry(root);
  return MANAGED_ARTIFACTS.map((artifact) => {
    if (artifact.path === REVIEW_DIMENSIONS_PATH) {
      return { ...artifact, content: serializeUpgradableJsonArtifact(registry) };
    }
    if (artifact.path === ".claude/skills/ccr/references/dimensions.md") {
      return { ...artifact, content: renderReviewDimensionReference(registry) };
    }
    return artifact;
  });
}

/** Single lifecycle inventory for non-executable marked integrations. */
export const MANAGED_BLOCK_ARTIFACTS: readonly ManagedBlockArtifact[] = [
  {
    content: IGNORE_BLOCK,
    path: ".gitignore",
    setupCondition: "always",
    uninstallCondition: "without-local-state",
  },
  {
    content: CLAUDE_BLOCK,
    path: "CLAUDE.md",
    setupCondition: "updateClaudeMd",
    uninstallCondition: "always",
  },
  {
    content: CLAUDE_BLOCK,
    path: "AGENTS.md",
    setupCondition: "updateAgentsMd",
    uninstallCondition: "always",
  },
];

export type ManagedSkillOwnership = "foreign" | "package" | "user";

/** Classifies only a canonical post-frontmatter header as skill ownership. */
export function managedSkillOwnership(content: string): ManagedSkillOwnership {
  const lines = content.split(/\r?\n/);
  if (lines[0] !== "---") return "user";
  const frontmatterEnd = lines.indexOf("---", 1);
  if (frontmatterEnd < 2) return "user";
  const frontmatter = lines.slice(1, frontmatterEnd);
  const hasName = frontmatter.some((line) => /^name:\s*\S/.test(line));
  const hasDescription = frontmatter.some((line) => /^description:\s*\S/.test(line));
  if (!hasName || !hasDescription || lines[frontmatterEnd + 1] !== "") return "user";
  const marker = lines[frontmatterEnd + 2];
  if (!marker?.startsWith("<!-- managed by CCR skill;")) return "user";
  if (marker !== MANAGED_SKILL_MARKER) return "foreign";
  return content.split(MANAGED_SKILL_MARKER).length === 2 ? "package" : "user";
}

/** Returns whether a skill carries CCR's canonical package-owned update header. */
export function isPackageManagedSkill(content: string): boolean {
  return managedSkillOwnership(content) === "package";
}
