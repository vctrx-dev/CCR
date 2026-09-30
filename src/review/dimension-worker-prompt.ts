/**
 * Shared single-agent prompt template for installed reviews and standalone previews.
 * Edit structure here; never keep a second copy of the prompt in skills.
 */
import type { ReviewDimensionRegistry } from "./dimensions";
import { STAKEHOLDER_IMPACT_REVIEW_STANDARD } from "./impact-review-guidance";

type ReviewDimension = ReviewDimensionRegistry["dimensions"][number];

/** Shared reporting contract; evidence and uncertainty stay separate from supported findings. */
export const REVIEW_REPORT_FORMAT = `### Output

Begin with one **Context applied:** line naming the recorded decisions and earlier open findings
that shaped this review, or \`none\`.

For supported bugs:

**F1 [severity; dimension-id]:** in plain language, who is harmed, treated unfairly, or excluded and how
**Scenario:** a realistic example of how this affects someone; say if it is hypothetical
**Evidence:** relevant file/path, function, rule, or code behavior

Number findings F1, F2, and so on in report order, and reuse the label of a finding carried forward
from the active journal. Use Critical, High, Medium, or Low based on the impact on people. Put the
most severe issues first and combine duplicates. For accessibility, explain the person's access need and the action they
cannot complete or can complete only with unequal barriers. Check that each finding meets the rules
above before reporting it.

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
export const PRODUCT_AUDIENCE_CONTEXT = `Learn what this software does and who uses it from the README, source, documentation, and
\`.ccr/project.md\` and \`.ccr/stakeholders.md\` when present. Check what those documents say against the code.
For educational software, consider not only the people using the system
directly, but also the **students and other learners who may ultimately be affected by its outputs,
decisions, and evaluation choices**.`;

function workerInstructions(scope: string): string {
  return `Review ${scope} for **inclusivity bugs** related to the dimension below.

${PRODUCT_AUDIENCE_CONTEXT}

${STAKEHOLDER_IMPACT_REVIEW_STANDARD}`;
}

/** Includes scope boundaries and criterion names; research IDs stay in registry metadata. */
export function renderDimensionSection(dimension: ReviewDimension): string {
  const criteria = dimension.criteria
    .map(({ name, details }, index) => `${index + 1}. **${name}**\n   ${details}`)
    .join("\n\n");
  return `### Dimension: ${dimension.name}

${dimension.summary}

Review the code against these criteria:

${criteria}`;
}

/** Renders a read-only, single-agent review of one dimension for contributor previews. */
export function renderDimensionWorkerPrompt(dimension: ReviewDimension, scope: string): string {
  return `Do not change any files.

${workerInstructions(scope)}

Dimension ID: ${dimension.id}

${renderDimensionSection(dimension)}

${REVIEW_REPORT_FORMAT}
`;
}
