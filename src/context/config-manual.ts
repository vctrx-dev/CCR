/** Human-readable companion for the CCR configuration, kept in schema order for quick lookup. */

export const CONFIG_MANUAL = `# CCR configuration

Edit \`.ccr/config.json\` directly or run \`ccr config set <key> <value>\`, then run \`ccr config validate\`. CCR does not rewrite your settings, except that the first \`/ccr-context initialize\` may replace the untouched \`domain: "unspecified"\` default once.

| Setting | Default | What it controls |
| --- | --- | --- |
| \`domain\` | \`"unspecified"\` | A 1–80 character product-domain label. Initialize can derive it from evidence; later operations leave it alone. |
| \`hooks.enabled\` | \`true\` | Whether CCR's advisory Git integration is installed. Run \`/ccr-hooks sync\` after enabling or \`/ccr-hooks remove\` after disabling. |
| \`hooks.checkBeforeCommit\` | \`true\` | Whether pre-commit prints one short line when uncommitted work reviewed with \`/ccr-review\` changed before commit. While this and \`hooks.enabled\` are both \`true\`, each commit also updates context automatically in the background. |
| \`context.recentJournalEntries\` | \`1\` | How many recent journal entries (1–10) context and review read besides the active entry, which is always read. “Recent” means the latest validated \`Updated\` time across all branches; empty placeholder entries are skipped. |
| \`instructions.updateClaudeMd\` | \`true\` for new setups | Lets \`ccr setup\` maintain CCR's small block in root \`CLAUDE.md\`, so Claude Code keeps the review journal current after compaction. |
| \`instructions.updateAgentsMd\` | \`true\` for new setups | Lets \`ccr setup\` maintain CCR's small block in root \`AGENTS.md\`. |

Older files may still contain \`hooks.autoUpdateContext\`, \`context.maxCompactionPercent\`, or \`instructions.updateDecisionsMd\`. They remain valid but are ignored: automatic updates follow the two hook settings, \`/ccr-context compact\` removes at most 25%, and reusable human review rationale can always be appended to \`.ccr/decisions.md\`.

## Useful examples

\`\`\`sh
ccr config set domain education-technology
ccr config set context.recentJournalEntries 3
ccr config set hooks.checkBeforeCommit false
ccr config validate
\`\`\`

## After changing settings

- Run \`ccr setup\` after changing either \`instructions.updateClaudeMd\` or \`instructions.updateAgentsMd\`.
- Run \`/ccr-hooks sync\` after enabling hooks, or \`/ccr-hooks remove\` after disabling them.
- Other settings apply on the next CCR operation.

## Automatic context updates

When a commit was not already covered by a review or context update, the post-commit hook starts a background run with headless Claude Code and returns immediately. Rebases are skipped, and runs for quick successive commits wait their turn. If a run fails, the next commit prints one short line. The run gives headless Claude only a privacy-filtered commit packet and CCR-owned inputs. It can write only the matching local journal, \`.ccr/project.md\`, and one append-only decision backed by human rationale already in the journal. It never edits source code, stages, commits, amends, resets, or pushes. Set \`hooks.checkBeforeCommit\` to \`false\` to stop it and update manually with \`/ccr-context update last commit\`.

Mandatory privacy exclusions always apply. Optional \`privacy.excludedPaths\` adds up to 100 repository-specific exclusion globs; edit it directly in the JSON configuration. Existing restrictions survive legacy upgrades and unrelated setting changes.
`;
