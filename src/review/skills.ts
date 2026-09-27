import { MANAGED_SKILL_MARKER } from "../context/skill-marker";
import { renderDimensionWorkerPrompt } from "./dimension-worker-prompt";
import { REVIEW_DIMENSIONS } from "./dimensions";

const CCR = "npx --no-install ccr";

const SUBAGENT_PROMPTS = REVIEW_DIMENSIONS.dimensions
  .map((dimension) => {
    const prompt = renderDimensionWorkerPrompt(dimension, "the current codebase").trimEnd();
    return `### ${dimension.id}\n\n\`\`\`\`markdown\n${prompt}\n\`\`\`\``;
  })
  .join("\n\n");

/**
 * Minimal master prompt followed by one subagent prompt per dimension. Prompt wording lives in
 * dimension-worker-prompt.ts and dimensions.json; the installed dimensions.md is reference only.
 */
export const CCR_REVIEW_SKILL = `---
name: ccr-review
description: Review code for inclusivity bugs. Usage /ccr-review [changes | codebase | PR-<number>] [all | dimension-id,...]; changes = uncommitted changes (default), codebase = whole codebase, PR-<number> = a pull request; all = every dimension (default). Example /ccr-review PR-123 privacy,inclusion.
argument-hint: "[changes | codebase | PR-<number>] [all | dimension-id,...]"
---

${MANAGED_SKILL_MARKER}
You lead an inclusivity review. Do not change code.

\`$ARGUMENTS\` is a scope (\`changes\`, \`codebase\`, or \`PR-<number>\`) and dimensions (\`all\` or IDs
separated by commas). The default is \`changes all\`. Dimension IDs are the headings below. Fix obvious
typos. If unclear, show the valid choices and stop.

1. Get the scope:
   - changes: all uncommitted changes
   - codebase: the whole codebase, including uncommitted changes
   - PR: the pull request's changes (read only)
2. Start one subagent for each dimension, all at once, using the prompts below. Tell each one the
   scope and that it must not edit anything.
3. Go through what they find. Double-check it in the code, merge duplicates, and turn anything
   uncertain into a question. Drop anything that is really a technical bug rather than an unfair
   design choice.
4. Save the review with \`${CCR} context save-review\` (see its \`--help\`).
5. If the user confirms a lasting rule and \`.ccr/config.json\` allows decision updates, add it as one
   line to \`.ccr/decisions.md\`.
6. Share the results in the same output format.

## Subagent prompts

${SUBAGENT_PROMPTS}
`;
