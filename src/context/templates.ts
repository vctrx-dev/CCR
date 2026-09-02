import { DEFAULT_CONTEXT_CONFIG, serializeContextConfig } from "./config";
import { CONFIG_MANUAL } from "./config-manual";

/**
 * Source templates for context files and optional instruction blocks. Add shared generated content
 * here, then register its lifecycle in `managed-artifacts.ts` instead of embedding it in workflows.
 */

const managedHeader = "<!-- managed by CCR; edit facts, keep headings -->";

export const RETIRED_CONTEXT_FILES: Readonly<Record<string, string>> = {
  ".ccr/index.md": `${managedHeader}
# CCR Context Index

Read only the pages relevant to the current task:

- Product purpose, behavior, and technical context: [project.md](project.md)
- People affected by the software: [stakeholders.md](stakeholders.md)

Source, tests, and schemas outrank generated context.
`,
};

export const CONTEXT_FILES: Readonly<Record<string, string>> = {
  ".ccr/config.json": serializeContextConfig(DEFAULT_CONTEXT_CONFIG),
  ".ccr/config-manual.md": CONFIG_MANUAL,
  ".ccr/project.md": `${managedHeader}
# Project

This is a living, evidence-backed account of the product's consequential behavior—not an
architecture summary. Begin with the human situation the product intervenes in: its purpose, the
people who use or experience it, and the decisions or actions it shapes. Explain the code-backed
rules, defaults, automations, permissions, or constraints that determine what those people can see,
do, understand, contest, or be affected by.

Connect technical details only when they make that causal product behavior legible. Capture durable
assumptions, unequal burdens, missing feedback or recovery paths, and safety boundaries when
evidence supports them. Name unknowns rather than inventing a human impact. Avoid a file-by-file
inventory, framework summary, or a generic-bug catalogue.

Make the narrative visually scannable: use a few descriptive headings, short paragraphs, focused
bullets, compact decision tables when comparison matters, and plain-text causal flows such as
\`learner → submits work → scoring rule → feedback\`. Prefer one precise, evidence-backed detail over
several vague sentences. Do not force a fixed outline or use decorative diagrams.

## Evidence

Cite each material claim close to the relevant sentence with a live path and symbol, schema,
command, test, or precise contract. Mark future plans as intent, not implemented behavior.
`,
  ".ccr/stakeholders.md": `${managedHeader}
# Stakeholders

## Direct

- Needs developer confirmation.

## Indirect

- Needs developer confirmation.

## Potentially affected

- Needs developer confirmation.

## Roles and access

- Needs repository-backed confirmation.

## Impacted workflows

- Needs repository-backed confirmation.

## Open questions

- Needs developer confirmation.

## Evidence

- Cite live product surfaces, schemas, contracts, or explicit product statements.
`,
  ".ccr/decisions.md": "",
};

export const CLAUDE_BLOCK = `<!-- ccr:start -->
## CCR context

Read \`.ccr/project.md\`, \`.ccr/stakeholders.md\`, and relevant entries in \`.ccr/decisions.md\`
when repository context is useful.
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
