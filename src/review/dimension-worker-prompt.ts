/**
 * Shared subagent prompt template for installed dimension prompts and test:prompt previews.
 * Edit structure here; never keep a second copy of the prompt in skills.
 */
import type { ReviewDimensionRegistry } from "./dimensions";
import { STAKEHOLDER_IMPACT_REVIEW_STANDARD } from "./impact-review-guidance";

type ReviewDimension = ReviewDimensionRegistry["dimensions"][number];

/** Output format; the master report points subagents and itself at this section. */
const REVIEW_REPORT_FORMAT = `### Output

For supported bugs:

**Finding [severity]:** in plain, non-technical language, who is treated unfairly and how
**Scenario:** one realistic or hypothetical example
**Evidence:** relevant file/path, function, rule, or code behavior

For uncertain issues:

**Question:** what needs to be established before this can be considered an inclusivity bug
**Context:** the relevant code behavior and why it may matter

If no supported findings exist, say:

**No supported inclusivity bugs found.**

Do not propose fixes unless asked.`;

/**
 * Product-agnostic audience paragraph. Target repositories describe their actual product and
 * affected people in `.ccr/project.md` and `.ccr/stakeholders.md`.
 */
export const PRODUCT_AUDIENCE_CONTEXT = `This software is used in education. Learn what it does and who uses it from \`.ccr/project.md\`,
\`.ccr/stakeholders.md\`, source, and documentation. Consider not only the people using the system
directly, but also the **students and other learners who may ultimately be affected by its outputs,
decisions, and evaluation choices**.`;

function workerInstructions(scope: string): string {
  return `Review ${scope} for **inclusivity bugs** related to the dimension below.

${PRODUCT_AUDIENCE_CONTEXT}

${STAKEHOLDER_IMPACT_REVIEW_STANDARD}`;
}

/** Renders one dimension as numbered criterion questions; summaries and IDs stay out of the prompt. */
function renderDimensionSection(dimension: ReviewDimension): string {
  const questions = dimension.criteria
    .map(({ name, details }, index) => `${index + 1}. **${name}**\n   ${details}`)
    .join("\n\n");
  return `### Dimension: ${dimension.name}

Review the code through these questions:

${questions}`;
}

/** Renders the complete standalone worker prompt for one dimension and a plain-language scope. */
export function renderDimensionWorkerPrompt(dimension: ReviewDimension, scope: string): string {
  return `${workerInstructions(scope)}

${renderDimensionSection(dimension)}

${REVIEW_REPORT_FORMAT}
`;
}
