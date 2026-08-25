import { REVIEW_DIMENSION_REFERENCE } from "../review/dimensions";

/** Package-managed progressive-disclosure resource installed below a skill directory. */
export interface SkillResourceDefinition {
  path: string;
  content: string;
}

/** One shared generated taxonomy consumed by the support and review skill. */
export const CCR_SKILL_RESOURCES: readonly SkillResourceDefinition[] = [
  {
    path: ".claude/skills/ccr/references/dimensions.md",
    content: REVIEW_DIMENSION_REFERENCE,
  },
];

/** Exact former generated copies retained only for safe upgrade cleanup. */
export const RETIRED_CCR_SKILL_RESOURCES: readonly SkillResourceDefinition[] = [
  {
    path: ".claude/skills/ccr-review/references/dimensions.md",
    content: REVIEW_DIMENSION_REFERENCE,
  },
  {
    path: ".claude/skills/ccr-codebase/references/dimensions.md",
    content: REVIEW_DIMENSION_REFERENCE,
  },
];
