import { DEFAULT_CONTEXT_CONFIG } from "./config";

/**
 * Source templates for context files and optional instruction blocks. Add shared generated content
 * here, then register its lifecycle in `managed-artifacts.ts` instead of embedding it in workflows.
 */

const managedHeader = "<!-- managed by CCR; edit facts, keep headings -->";

export const CONTEXT_FILES: Readonly<Record<string, string>> = {
  ".ccr/config.json": `${JSON.stringify(DEFAULT_CONTEXT_CONFIG, null, 2)}\n`,
  ".ccr/index.md": `${managedHeader}
# CCR Context Index

Read only the pages relevant to the current task:

- Product purpose, behavior, and technical context: [project.md](project.md)
- People affected by the software: [stakeholders.md](stakeholders.md)

Source, tests, and schemas outrank generated context.
`,
  ".ccr/project.md": `${managedHeader}
# Project

This is a living, evidence-backed narrative of how this repository matters and works. Begin with the
project's purpose and real-world use, then continue in the natural order needed to explain what
happens, why the design exists, and what a future change must respect. Do not divide the account
into fixed categories; connect relevant product, human, logical, technical, operational, and future
details where they explain one another.

Capture small but consequential facts when evidence shows their impact: defaults, opt-ins,
conventions, ownership, edge cases, failure behavior, safety boundaries, compatibility promises,
and constraints that a future implementation could accidentally break. Keep uncertainty explicit and
avoid a file-by-file inventory.

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
};

export const CLAUDE_BLOCK = `<!-- ccr:start -->
## CCR context

Read \`.ccr/index.md\` and only relevant links when repository context is useful.
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
