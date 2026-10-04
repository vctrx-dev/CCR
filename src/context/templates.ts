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

Keep technical material out of shared context prose, including evidence sections and parenthetical
citations: no file paths, line numbers, code names, commands, framework names, technical acronyms,
or descriptions of internal processing. Read technical sources to establish the facts, then explain
only what people experience and why it matters. Verify important claims against sources during
discovery without copying technical citations into the writing or moving them to another file.
Preserve package-managed metadata needed for continuity; do not expand it into technical prose.
Journals may retain a short Supporting references section after their plain-language account:
include only relevant repository paths, check names and outcomes, or a finding label linking human
clarification to its origin. These references support later verification, not a changed-file inventory.
A reviewer should never need to
open a source file or look up a computing term to understand a sentence.

Describe meaningful choices and limits, rather than every setting, status, format, or validation
rule. Include a detail only when it helps explain someone's activity, access, control, or treatment.
Use familiar words: teachers can download questions for use in their teaching platform; they can
revise an answer; someone responsible for running the service may manage accounts. Keep uncertainty
when the actual process is unknown. Use sweeping words such as all, never, or guaranteed only when
evidence supports them; otherwise qualify the claim, for example "in the current version" or
"usually". Do not merely remove citations from an otherwise technical report.

Shared context files are background for a review, not a list of bugs or a declaration that the product is
fair. Record relevant rules and existing safeguards even when no concern is apparent. Keep possible
concerns distinct from established facts. Clarification questions belong in the interactive chat,
not in project.md or stakeholders.md: do not add question lists, Q&A transcripts, or sections such as
"Open questions" or "What still needs confirming". Incorporate clarified facts into the relevant
paragraphs. If something remains unknown after the user declines or cannot answer, state only the
useful limitation in plain language; do not disguise an unasked question as a statement. Automatic
updates cannot ask questions: preserve uncertainty without inventing answers or adding a question backlog.
Do not invent developer motives,
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

/** Shared journal content contract; callers retain their own target selection and write permissions. */
export const JOURNAL_WRITING_GUIDANCE = `## Journal content

Keep a compact, living account that makes sense without the chat, the report, or the code. Someone
reading it days later should understand what was reviewed, each finding, what was decided, and what
is left. Use plain language and short bullets. Maintain these sections, omitting optional sections
when empty:
- Summary: one to three sentences on what was reviewed or requested, the main result, and where the
  work stands now.
- Findings and outcomes: exactly one bullet per distinct issue. Each bullet is a concise summary of
  the reported finding, never a copy of it: about 40–80 words in this shape:
  \`F1 (High, Dimension name) — open: who is affected and what happens to them, because of which
  rule or behavior, in plain words. Why it matters. Reason for the status or the next check.\`
  Keep the stable label, severity, dimension, affected people, cause, consequence, status, and its
  reason. Leave out the scenario story, evidence quotes, code, and repeated explanation. Statuses are
  open, questioned, rejected, deferred, changed-but-unverified, and fixed-and-verified. When a status
  changes, edit the same bullet and keep one short reason; preserve a short note when an earlier
  finding was corrected.
- Work and decisions (when useful): follow-up answers, actions actually taken, human choices and
  their rationale, checks performed and results, and any shared-context updates, one line each.
- Next steps (when useful): unresolved questions, blockers, or remaining checks, not generic advice.
- Supporting references (when useful): at most one short line per finding label naming the main file
  or check behind it, so later work can find the evidence. Distinguish observed behavior,
  human-reported practice, and plans.

Example finding bullet:
\`F2 (Medium, Inclusion & Accessibility) — open: people whose names contain accents, apostrophes, or
spaces cannot finish sign-up, because the name field accepts only plain English letters. They must
misspell their own name to take part. Checked for another sign-up route; none exists.\`

If none were found, state that once with any material coverage limit. Update existing bullets rather
than copying reports or appending a transcript. Remove obsolete placeholders, empty disposition
categories, repeated counts in prose, and generic process narration. Keep meaningful earlier outcomes
and decisions. Preserve the package-managed identity, timestamps, review-run headings and metadata;
those support freshness checks. Use subordinate headings within a review run so its metadata remains
in that section. Keep the complete entry within CCR's 64,000-character limit; condense repetition
before it fills. Never record secrets, personal records, raw private discussion, or a changed-file
inventory.`;

/** Reused by review and context writers so human review rationale has one promotion policy. */
export const REVIEW_DECISION_GUIDANCE = `## Human review decisions

decisions.md preserves uncommon human rationale learned in review follow-ups that future reviewers
would otherwise miss. Append only when all are true:
- A human explicitly explains or confirms the rationale in response to a review finding.
- It establishes a lasting product choice, intended behavior, exception, or outside-the-software
  practice that could otherwise produce similar findings in future reviews.
- That rationale is not already adequately represented in project.md, stakeholders.md, or decisions.md.

Capture the smallest reusable rule: what was questioned, the human's choice and reason, where it
applies, and any important conditions. Attribute human-provided intent or outside practices as such;
they need not appear in source code to be useful context. Check code claims against evidence and
preserve contradictions or uncertainty. A bare "false positive" without a reason belongs in the
journal pending clarification. A fix request, inferred code behavior, review recommendation, or
accepted unresolved risk alone is not proof of a false positive or a durable decision.

Read existing context before appending; avoid duplicates and preserve human entries. Use CCR's
append-decision support during interactive follow-up. Choose the destination before writing:
missing human rationale that explains an intentional review exception belongs in decisions;
project.md describes enduring product facts and plans, without duplicating that explanation.
Automatic context updates may carry forward
only an explicit human review rationale already recorded in the approved journal, never originate
a decision from a commit or infer human agreement.

At the start of every review, read decisions with project and stakeholder context. Apply each rule
within its stated scope: do not repeat the same resolved finding when the human explanation still
applies. Reconsider it only when changed behavior, a broken assumption, or new evidence creates a
materially different concern; explain what changed. Decisions supply context, not blanket immunity
from review. If the human revises a prior rule, append the clarified scope or superseding rule rather
than silently rewriting history. Identify the earlier rule clearly and state which conditions changed.
When decisions approach the storage limit or contradict one another, surface the specific conflict
and propose a concise reconciliation to the human. Do not silently drop a decision to make room.
Only an explicit human request to maintain decisions permits a replacement: show the complete diff,
preserve every still-applicable rationale, retain a short superseded-rule summary and reason, and
validate before reporting completion. This maintenance permission never authorizes inventing rules.`;

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

`,
  ".ccr/decisions.md": "",
};

export const CLAUDE_BLOCK = `<!-- ccr:start -->
## CCR context

Read \`.ccr/project.md\`, \`.ccr/stakeholders.md\`, and relevant entries in \`.ccr/decisions.md\`
when product purpose, affected people, or consequential decision context is useful.
Use \`/ccr-context initialize\` for first discovery and \`/ccr-context update\` after durable
changes. CCR context is advisory; source, tests, and schemas have priority.
After /ccr-review, follow its session-continuity instructions on each subsequent turn: reread the
active journal as needed, update the same entry before replying, and carry its path and unresolved
items through compaction. Load the installed ccr-review skill again if those instructions were lost.
Use the ccr-context ownership rules to decide whether a durable fact warrants a shared-context edit.
<!-- ccr:end -->`;

export const IGNORE_BLOCK = `# ccr:start - local context continuity
.ccr/config.local.json
.ccr/journal/
.ccr/private/
.ccr/cache/
.ccr/tmp/
# ccr:end`;
