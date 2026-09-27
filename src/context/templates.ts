import { DEFAULT_CONTEXT_CONFIG, serializeContextConfig } from "./config";
import { CONFIG_MANUAL } from "./config-manual";

/**
 * Source templates for context files and optional instruction blocks. Add shared generated content
 * here, then register its lifecycle in `managed-artifacts.ts` instead of embedding it in workflows.
 */

const managedHeader = "<!-- managed by CCR; edit facts, keep headings -->";

/**
 * Shared guidance for interactive and automatic context writing. This describes content, not write
 * permission; callers must preserve their file ownership and evidence-access rules.
 */
export const CONTEXT_WRITING_GUIDANCE = `## Write context that helps an ethical review

Write all generated context prose, including project.md, stakeholders.md, decisions, and journals,
for a non-technical ethical reviewer who does not read code
and does not need to understand how the software is built. These files must stand on their own.
Write in everyday language,
using simple headings and short paragraphs or bullets. Include as much detail as the evidence
supports and the review needs. A short, useful account is better than filling sections with guesses.

For project.md, explain:
- What problem the software tries to solve, for whom, and why that matters.
- How people use it, from their starting situation to the result they receive. Include people
  affected by its outputs even if they never sign in or use the software themselves.
- Which rules, defaults, prompts, or assumptions shape that experience. What counts as a good
  result, a correct answer, or a person who qualifies? Who chose or can change that rule?
- What people must have or do to take part, such as language skills, time, money, equipment,
  connectivity, or an accessible way to use the product.
- Who makes decisions, who can see why a decision was made, and who can question or correct it.
- How personal information is used, what people are told, and what choice or control they have.
- What is known about effects on learning, opportunity, participation, dignity, or workload,
  and what still needs checking. Separate current behavior from proposed plans.

For stakeholders.md, describe people and their relationship to the software, not just account types.
For each supported role or group, explain their goals, how they use the software or encounter its
results, what decisions affect them, and what say they have in those decisions. Include people who
benefit, people who carry extra work or risk, and people who could be left out. Note relevant access
needs or circumstances without treating them as fixed group traits. Use roles, not real names or
personal records. If a role is only possible, say so and explain what needs confirming. Do not assume
a product has no effect on learners because only instructors have accounts.

Keep technical material out of all context prose, including evidence sections and parenthetical
citations: no file paths, line numbers, code names, commands, framework names, technical acronyms,
or descriptions of internal processing. Read technical sources to establish the facts, then explain
only what people experience and why it matters. Verify important claims against sources during
discovery without copying technical citations into the writing or moving them to another file.
Preserve package-managed metadata needed for continuity; do not expand it into technical prose.
A reviewer should never need to
open a source file or look up a computing term to understand a sentence.

Describe meaningful choices and limits, rather than every setting, status, format, or validation
rule. Include a detail only when it helps explain someone's activity, access, control, or treatment.
Use familiar words: teachers can download questions for use in their teaching platform; they can
revise an answer; someone responsible for running the service may manage accounts. Keep uncertainty
when the actual process is unknown. Do not merely remove citations from an otherwise technical report.

These files are background for a review, not a list of bugs or a declaration that the product is
fair. Record relevant rules and existing safeguards even when no concern is apparent. Describe a
possible concern as a question unless the evidence establishes it. Do not invent developer motives,
community reactions, measured disparities, or outside policies. An absent screen does not prove
there is no human process elsewhere. Never copy secrets, personal records, or private discussions.

Examples:
- For a quiz tool, explain who supplies the material, how answers are judged, whether teachers can
  change them, and how learners encounter the result. Do not list its libraries.
- For a service application, explain who qualifies, what proof they need, who decides, and how
  someone can challenge a rejection. Verify the rule, then explain it in everyday words.
- For a mouse-only submission step, describe the task a keyboard user cannot complete and any
  other way to submit. Do not turn it into a general list of UI defects.
- If a library's eventual users are unknown, describe the people known to use or depend on it and
  state what cannot be established. Do not invent a school, student population, or social impact.`;

export const CONTEXT_FILES: Readonly<Record<string, string>> = {
  ".ccr/config.json": serializeContextConfig(DEFAULT_CONTEXT_CONFIG),
  ".ccr/config-manual.md": CONFIG_MANUAL,
  ".ccr/project.md": `${managedHeader}
# Project

## Purpose

Explain what this software helps people do, who it is for, and why the result matters.

## How people use it and are affected

Describe the main activities and the people affected by their results, including people who do not
use the software directly. Explain rules and assumptions that shape learning, access, opportunity,
privacy, or how people are represented. Keep this in plain language, without implementation details.

## Choices, access, and correction

Describe what people need to take part, who makes decisions, and what people can understand,
question, or change. Include accessibility needs, existing alternatives, and human support when known.

## What still needs confirming

Separate known behavior, possible effects, and unanswered questions. Label future plans clearly.
Do not assume harm or fairness. Keep only details that help a reviewer understand the people involved.

`,
  ".ccr/stakeholders.md": `${managedHeader}
# Stakeholders

## Direct

- Identify people who use the software: their goals, activities, and the results they rely on.

## Indirect

- Identify people affected by outputs or decisions without using the software themselves.

## Potentially affected

- Describe who might be left out or carry extra work, and the circumstances that matter.
  Separate supported roles from possibilities that need confirmation. Avoid stereotypes.

## Roles and access

- Explain who decides, who can understand or challenge the result, and who can correct it.
  Include access needs and practical constraints, not technical permission tables.

## Impacted workflows

- For each relevant role, connect what they do or receive to effects on learning, opportunity,
  participation, dignity, privacy, or workload. Include existing support and alternatives.

## Open questions

- State what is unknown about people's needs, the use of outputs, or outside review and support.

`,
  ".ccr/decisions.md": "",
};

export const CLAUDE_BLOCK = `<!-- ccr:start -->
## CCR context

Read \`.ccr/project.md\`, \`.ccr/stakeholders.md\`, and relevant entries in \`.ccr/decisions.md\`
when product purpose, affected people, or consequential decision context is useful.
Use \`/ccr-context initialize\` for first discovery and \`/ccr-context update\` after durable
changes. CCR context is advisory; source, tests, and schemas have priority.
<!-- ccr:end -->`;

export const IGNORE_BLOCK = `# ccr:start - local context continuity
.ccr/config.local.json
.ccr/journal/
.ccr/private/
.ccr/cache/
.ccr/tmp/
# ccr:end`;
