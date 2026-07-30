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

## Purpose

Needs repository-backed confirmation.

## Product capabilities

- Needs repository-backed confirmation.

## Primary workflows

- Needs repository-backed confirmation.

## Operating domain

Needs developer confirmation.

## Direct users

Needs developer confirmation.

## Important domain terms

- Needs repository-backed confirmation.

## Scope boundaries

- Needs repository-backed confirmation.

## Technical structure

- Summarize entry points, runtime modules, boundaries, and contracts.

## Data, identity, and integrations

- Summarize important state, permissions, and external systems.

## Verification

- Cite executable commands and the tests or checks they run.

## Evidence

- Cite live paths plus symbols, commands, schemas, or precise contracts.
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
