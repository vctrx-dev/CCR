/**
 * Shared single-agent prompt template for installed reviews and standalone previews.
 * Edit structure here; never keep a second copy of the prompt in skills.
 */
import type { ReviewDimensionRegistry } from "./dimensions";
import { STAKEHOLDER_IMPACT_REVIEW_STANDARD } from "./impact-review-guidance";

type ReviewDimension = ReviewDimensionRegistry["dimensions"][number];

/** Shared readable report contract; unsupported claims stay out of the findings list. */
export const REVIEW_REPORT_FORMAT = `### Output

Begin with one **Context applied:** line naming the recorded decisions and earlier open findings
that shaped this review, or \`none\`.

For supported bugs:

### 1. Short finding title

**Severity:** Critical, High, Medium, or Low

**Dimension / criterion:** applicable dimension and criterion names, or Other — outside current dimensions

In plain language, who is harmed, treated unfairly, or excluded and how.

**Scenario:** a realistic example of how this affects someone; say if it is hypothetical

**Evidence:** relevant file/path, function, rule, or code behavior

Separate consecutive findings with a Markdown horizontal rule (\`---\`) on its own line, with blank
lines around it. Number findings 1, 2, 3, and so on, starting at 1 in each completed report. Keep
stable journal finding identities for follow-ups even when display numbers change. Use Critical,
High, Medium, or Low based on the impact on people. Put the
most severe issues first and combine duplicates. For accessibility, explain the person's access need and the action they
cannot complete or can complete only with unequal barriers. Check that each finding meets the rules
above before reporting it.

Include supported ethical/inclusivity issues outside the current taxonomy in this same numbered
list, labeled **Other — outside current dimensions**, with the same severity, scenario, and evidence.
Do not add a separate other-issues section or include unrelated ordinary engineering defects.

Keep uncertain candidates out of the report and retain material unknowns in the journal when one is
being maintained. Omit Question/Context sections, unanswered-question lists, and trailing observations.
Still briefly disclose actual evidence limits or failed continuity writes; absence of supported
findings does not establish safety. Put any necessary disclosure before the findings, not in a
trailing section, and omit routine completion commentary.

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
