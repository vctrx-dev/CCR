/** Human-readable companion for the CCR configuration, kept in schema order for quick lookup. */

export const CONFIG_MANUAL = `# CCR configuration

Edit \`.ccr/config.json\` directly or run \`ccr config set <key> <value>\`, then run \`ccr config validate\`. CCR does not rewrite your settings, except that the first \`/ccr-context initialize\` may replace the untouched \`domain: "unspecified"\` default once.

| Setting | Default | What it controls |
| --- | --- | --- |
| \`domain\` | \`"unspecified"\` | A 1–80 character product-domain label. Initialize can derive it from evidence; later operations leave it alone. |
| \`hooks.enabled\` | \`true\` | Whether CCR's advisory Git integration is installed. Run \`/ccr-hooks sync\` after enabling or \`/ccr-hooks remove\` after disabling. |
| \`hooks.checkBeforeCommit\` | \`true\` | Whether the advisory pre-commit check warns about staged work without staged shared context. |
| \`hooks.autoUpdateContext\` | \`false\` | Whether post-commit automation maintains local CCR continuity. It never stages, commits, pushes, or changes source files. |
| \`context.recentJournalEntries\` | \`3\` | How many recent journal entries (1–10) context and review read. “Recent” means latest validated \`Updated\` time across all branches; ties use \`Started\`, then path. |
| \`context.maxCompactionPercent\` | \`25\` | Maximum reduction per \`/ccr-context compact\` run (20–30). |
| \`instructions.updateClaudeMd\` | \`false\` | Lets \`ccr setup\` maintain CCR's small block in root \`CLAUDE.md\`. |
| \`instructions.updateAgentsMd\` | \`false\` | Lets \`ccr setup\` maintain CCR's small block in root \`AGENTS.md\`. |
| \`instructions.updateDecisionsMd\` | \`false\` | Allows one evidence-backed, append-only durable decision during an interactive context or review operation. A finding is not a decision. |

## Useful examples

\`\`\`sh
ccr config set domain education-technology
ccr config set context.recentJournalEntries 5
ccr config set hooks.autoUpdateContext true
ccr config validate
\`\`\`

## After changing settings

- Run \`ccr setup\` after changing either \`instructions.updateClaudeMd\` or \`instructions.updateAgentsMd\`.
- Run \`/ccr-hooks sync\` after enabling hooks, or \`/ccr-hooks remove\` after disabling them.
- Other settings apply on the next CCR operation.

## Automatic context updates

When enabled, the post-commit hook gives headless Claude only a privacy-filtered commit packet and CCR-owned inputs. It can write only the matching local journal, \`.ccr/project.md\`, and—when the separate decision setting is enabled—one append-only decision. It never edits source code, stages, commits, amends, resets, or pushes. A failed update is non-blocking; use \`/ccr-context update\` manually.

Privacy exclusions are fixed safety defaults, not configuration keys.
`;
