# CCR Context Management Plan

## Outcome

CCR gives Claude Code a small, current, human-correctable understanding of an educational software
repository. A developer installs one plugin, reviews setup choices, previews the proposed files, and
then creates context. Daily use should be nearly invisible, while every automatic action remains
inspectable and reversible.

The architecture sections focus on context management. The version roadmap continues through the
reviewer skills and GitHub Action because `v1.0.0` represents the complete CCR product, not only its
context foundation.

## Product principles

1. **Human decisions outrank generated context.** Source, tests, schemas, and approved decisions
   remain the final authority.
2. **Small by default.** Claude loads an index and only the files routed for the current change.
3. **Advisory by default.** Stale context or review findings warn; they do not trap a developer in a
   commit or push loop.
4. **Local continuity, shared truth.** Personal branch journals stay local. Approved decisions and
   durable project context are committed.
5. **Preview before mutation.** Setup and configuration show their proposed changes before writing.
6. **Deterministic automation.** Hooks detect state and print repair commands. LLM work happens in a
   visible Claude skill, not inside a hidden Git hook.
7. **Plain files.** Markdown and JSON keep the context readable by people and reusable by future
   agents.
8. **No inferred approval.** Silence does not confirm a finding, decision, or stakeholder assumption.

## Perspectives

### User perspective

The repository adopter wants:

- one installation path;
- setup questions in plain language;
- safe defaults and a dry-run preview;
- clear descriptions of every created or modified file;
- commands for status, update, configure, repair, and uninstall;
- no secret transmission or surprise Git blocking;
- a useful result without understanding CCR internals.

Target first-run flow:

```text
install CCR plugin
    → /ccr:setup
    → answer or accept setup defaults
    → review proposed files, exclusions, and hooks
    → confirm
    → context initialization
    → validation report
    → normal development
```

### Developer perspective

A developer working in a configured repository wants:

- `CLAUDE.md` to point Claude toward CCR without carrying the entire context;
- local continuity filtered to the current branch;
- shared context updated only when durable behavior changes;
- a warning when relevant staged work may need a context update;
- one command to update and validate;
- Git diffs that make context changes reviewable;
- local overrides that never create team conflicts.

Normal flow:

```text
Claude changes code
    → CCR notices affected context areas
    → /ccr:context update inspects the staged diff
    → shared context changes only when durable knowledge changed
    → local branch journal records a concise session entry
    → deterministic validation reports fresh, warning, or invalid
    → commit continues
```

If the developer uses Git directly, a hook prints the status and exact update command. It does not
start Claude, rewrite files, stage files, retry a commit, or block it.

### Architecture perspective

CCR has four layers:

```text
Claude Code plugin
  setup + configure + context + status skills
                │
                ▼
Context service
  discover + route + update + compact + validate
                │
         ┌──────┴──────┐
         ▼             ▼
Committed truth      Local continuity
  config             branch journals
  context            private overrides
  decisions          local cache
         │             │
         └──────┬──────┘
                ▼
Deterministic adapters
  status command + optional Claude/Git hooks
```

The context service should be pure TypeScript functions behind a thin CLI. Skills orchestrate those
functions and Claude's repository inspection. Hooks call only deterministic CLI operations.

## Minimal target-repository layout

```text
CLAUDE.md                         # Small CCR pointer; existing content is preserved
AGENTS.md                         # Updated only when selected during setup
.claude/
  settings.json                  # Optional shared Claude hook configuration
.ccr/
  config.json                    # Committed team defaults
  config.local.json              # Ignored developer overrides
  index.md                       # Small routing entry point
  project.md                     # Purpose, users, and educational setting
  stakeholders.md                # Direct, indirect, and potentially affected groups
  architecture.md                # Boundaries, contracts, entry points, verification
  risks.md                       # Known and unresolved ethical risk areas
  decisions.md                   # Human-approved intentional behavior
  archive/                       # Older resolved shared context, created only when needed
  journal/                       # Ignored, branch-aware local continuity
  cache/                         # Ignored deterministic derived state
```

Start with these files. Add module pages only when `index.md` can no longer route the repository
clearly. Do not create one context file per source directory.

## Context authority and loading

Material claims use this order:

1. Live source and current diff
2. Tests, schemas, interfaces, and diagnostics
3. Human-approved `.ccr/decisions.md`
4. Git history
5. Generated CCR context
6. Local journal

`CLAUDE.md` receives only a short instruction to read `.ccr/index.md` when repository context is
relevant. Claude Code recommends keeping `CLAUDE.md` below 200 lines and using skills or scoped rules
for on-demand detail. Imported files organize instructions but do not reduce startup context.

The reviewer loads:

1. `index.md`;
2. context files routed by changed paths;
3. the latest two or three journal entries matching the current branch;
4. matching approved decisions;
5. older journal or archive entries only when a current trace requires them.

## Settings

### Shared settings

`.ccr/config.json` is schema-versioned, committed, commented through generated documentation rather
than non-standard JSON comments, and editable without reinstalling the plugin.

Initial settings:

```json
{
  "schemaVersion": 1,
  "domain": "education",
  "automation": {
    "mode": "warn",
    "checkBeforeCommit": true,
    "checkBeforePush": false
  },
  "context": {
    "maxIndexCharacters": 6000,
    "maxFileCharacters": 10000,
    "recentJournalEntries": 3
  },
  "privacy": {
    "providerPolicy": "claude-code-only",
    "excludedPaths": [".env*", "**/secrets/**", "**/student-data/**"]
  },
  "instructions": {
    "updateClaudeMd": true,
    "updateAgentsMd": false
  }
}
```

Avoid more settings until pilot users need them.

`providerPolicy` governs CCR operations; it does not claim to control unrelated Claude Code sessions
or an organization's Anthropic data-retention policy. A future non-Claude provider requires an
explicit configuration change and a new preview of the data boundary.

### Local settings

`.ccr/config.local.json` overrides shared values for one developer and is ignored by Git. Allowed
overrides are privacy restrictions, automation opt-outs, journal limits, and machine-specific
commands. A local setting may make privacy stricter but may not weaken a mandatory team exclusion.

Resolution order:

```text
safe built-in defaults
    < committed .ccr/config.json
    < permitted .ccr/config.local.json values
    < one-command flags
```

### Configuration experience

- `/ccr:setup` configures a repository before generating context.
- `/ccr:configure` shows current values, explains each option, previews changes, and validates them.
- `ccr config get`, `ccr config validate`, and `ccr config explain <key>` work without an LLM.
- Setup never overwrites existing instruction, settings, hook, or ignore files. It applies a
  marked, idempotent CCR block or reports a conflict for the developer to resolve.
- Every generated block has `managed by CCR`, schema version, and removal instructions.

## Setup plan

### Step 1: Preflight

Check Git, repository root, Claude Code availability, writable paths, existing CCR files, instruction
files, hooks, ignore rules, repository size, and sensitive-path signals. Do not write.

### Step 2: Collect choices

Ask only what cannot be safely inferred:

- educational product purpose;
- direct, indirect, and potentially affected stakeholders;
- sensitive or excluded areas;
- whether external LLM use is permitted, denied, or requires confirmation;
- shared versus local instruction changes;
- advisory pre-commit and optional pre-push checks.

Show inferred languages, source roots, tests, and commands for correction rather than asking the
developer to type them from scratch.

### Step 3: Preview

Display:

- files to create;
- exact existing files to modify;
- ignore additions;
- hook behavior;
- data potentially read or sent;
- context limits;
- rollback instructions.

Support `--dry-run` and a machine-readable JSON preview.

### Step 4: Initialize

Use one coordinator and at most one read-only exploration subagent per stable repository area, capped
at four by default. Small repositories use no subagents. Subagents return only paths, symbols,
contracts, stakeholders, risks, and verification evidence. The coordinator deduplicates and verifies
all material claims against live files.

### Step 5: Validate

Validate JSON schemas, required headings, route targets, excluded paths, size limits, secret-like
content, duplicate decisions, instruction blocks, and hook syntax. Report uncertainty instead of
inventing missing product facts.

### Step 6: Apply

After confirmation, write files atomically. Do not commit or push. Report all changes with a single
rollback command or file list.

## Update behavior

### What triggers an update

An update is relevant when staged changes affect:

- public interfaces or behavior;
- stakeholders or data handling;
- permissions, consent, accessibility, fairness, or human oversight;
- architecture boundaries or verification commands;
- an approved decision or known risk.

Formatting, tests-only refactors, and implementation changes that preserve contracts normally add
only a local journal entry.

### Update algorithm

1. Read configuration and validate exclusions.
2. Read the staged file list and diff.
3. Route changed paths through `index.md`.
4. Load only the matching shared context, decisions, and branch journal entries.
5. Inspect changed symbols and directly relevant tests or consumers.
6. Classify each proposed context change as shared, local, decision candidate, or no change.
7. Show the proposed shared diff.
8. Apply approved shared changes; write local continuity separately.
9. Compact only files above their soft limit.
10. Validate and report status.

The context skill is model-invocable, and the short managed instruction tells Claude to invoke it
automatically before committing relevant staged work. Ordinary context updates may be applied and
reported as normal generated artifacts because Git keeps them reviewable and reversible. New or
changed human decisions always require explicit approval.

The AI may propose a decision entry, but the developer must explicitly approve or edit it. Decision
entries include scope, rationale, affected stakeholders, paths or symbols, date, and approving
developer identity when available.

## Journals and archives

Local journal entries include:

- timestamp;
- branch and current commit;
- changed paths and important symbols;
- concise work summary;
- findings addressed, deferred, questioned, or rejected;
- links to approved decisions.

Load entries by branch first, then by relevant paths. Never treat another branch's most recent entry
as current. Bound each entry and retain a configurable local maximum. Local cleanup is recoverable
where practical and never modifies committed context.

Archive only resolved, committed context. Compaction:

1. removes duplication;
2. preserves approved decisions and unresolved risks verbatim;
3. replaces source explanation with paths and symbols;
4. moves older resolved detail to an archive;
5. leaves a trace to the archive and relevant commit.

Recent entries are protected from compaction. A hard limit produces a warning and a proposed
compaction diff, not silent information loss.

## Automation without loops

Default mode is `warn`.

- Claude instructions tell Claude to run context update before committing relevant staged changes.
- A Claude `PreToolUse` hook may detect a commit command and return a concise freshness warning.
- An optional Git pre-commit hook runs `ccr context status --staged`.
- No default hook invokes Claude, edits context, stages files, retries Git commands, or exits nonzero.
- Duplicate warnings use a fingerprint of branch, staged content, and warning type.
- The same unchanged warning appears once per session and is summarized afterward.
- A lock file with process ownership and a short timeout prevents re-entry.
- Hook failure fails open with a visible diagnostic because CCR is advisory.

CCR does not block commits, pushes, or pull requests. Context status and ethical findings remain
advisory; repositories may use their own independent policies outside CCR if they need enforcement.

Git client hooks are not copied by clone, so setup must install or configure them explicitly. CCR
must also provide `ccr hooks status` and `ccr hooks uninstall`.

## Transparency and safety

Every command supports:

- `--dry-run`;
- human-readable output;
- structured JSON output;
- a list of files read, skipped, created, and modified;
- reasons for routing and compaction;
- context size before and after;
- warnings and unresolved questions.

Never read or transmit secret values, environment files, credentials, student records, or personal
data by default. Exclusions apply before LLM context is assembled. Store no raw prompts, full diffs,
or source copies in shared context.

## Distribution

Develop CCR first as a local Claude Code plugin loaded with `--plugin-dir`. Package it as a plugin
because Claude Code uses plugins for reusable, versioned skills and hooks across repositories. The
plugin contains:

```text
ccr-plugin/
  .claude-plugin/plugin.json
  skills/
    setup/SKILL.md
    configure/SKILL.md
    context/SKILL.md
    status/SKILL.md
  agents/
    context-explorer.md
  hooks/
    hooks.json
  bin/
    ccr
```

Do not add an MCP server, database, vector store, daemon, AST framework, co-change matrix, coverage
database, or remote service in Phase 1.

## Versioned delivery

The plugin manifest and `package.json` use the same version. Each release updates `CHANGELOG.md` and
follows `VERSIONING.md`.

The repository currently declares an unreleased `0.1.0` and has no release tags. Keep that version
until the `v0.1.0` exit criteria below are satisfied; do not bump it for planning commits.

### `v0.1.0` — Contract and setup preview

- Finalize context/config schemas and authority rules.
- Implement `setup --dry-run`, preflight, configuration validation, and preview.
- Preserve existing files and generate no context without confirmation.
- Test on small TypeScript, Python, and mixed fixture repositories.

Exit: a developer understands every proposed change before CCR writes anything.

### `v0.2.0` — Context initialization

- Implement initialization, bounded exploration, routing, validation, and status.
- Create shared context plus ignored local journal/cache directories.
- Add safe instruction-file and ignore-file updates.
- No automatic hooks yet.

Exit: initialized context is accurate, concise, editable, and passes deterministic validation.

### `v0.3.0` — Incremental updates

- Implement staged-diff routing and shared/local classification.
- Add developer-approved decision proposals.
- Add branch-aware journals, compaction previews, and archives.
- Measure context size and unsupported repository shapes.

Exit: common changes update only relevant files without losing decisions or unresolved risks.

### `v0.4.0` — Advisory automation

- Add idempotent Claude hook and optional Git pre-commit status hook.
- Add warning fingerprints, re-entry locks, failure-open behavior, hook status, and uninstall.
- Keep pre-push disabled by default.

Exit: automation survives repeated commits, rebases, worktrees, hook failure, and branch switching
without loops or surprise blocking.

### `v0.5.0` — Reviewer skill foundation

- Define the stable finding contract: issue number, classification, severity, evidence,
  description, affected stakeholders, location, and suggested response.
- Support `issue`, `question`, and `observation` without presenting uncertainty as a confirmed bug.
- Load only routed CCR context, relevant decisions, the selected diff, and required live evidence.
- Add the first research-backed educational review dimensions supplied and approved by the research
  team.
- Produce a local, human-readable report without GitHub integration.

Exit: the skill produces evidence-linked educational review findings and questions from a bounded
diff without changing approved decisions automatically.

### `v0.6.0` — Multi-dimension review and aggregation

- Run independent, bounded reviewer subagents for enabled research dimensions.
- Cap concurrency and turns through configuration; do not allow nested reviewer-agent trees.
- Aggregate results through one coordinator.
- Deduplicate overlapping findings while preserving distinct stakeholder impacts.
- Require live evidence for every issue and clearly label unanswered questions.
- Report which files, dimensions, and context sources were examined or skipped.

Exit: parallel review is more accurate than the single reviewer in evaluation fixtures without
creating duplicate-heavy or untraceable reports.

### `v0.7.0` — Human feedback and decision integration

- Let developers accept, reject, defer, or answer each finding or question.
- Propose narrowly scoped decision entries for rejected intentional behavior.
- Require developer confirmation before committing a decision.
- Record concise branch-local continuity entries and references to shared approved decisions.
- Fingerprint addressed findings so unchanged warnings are summarized rather than repeated.

Exit: developer feedback improves later reviews without learning from silence or suppressing
unrelated findings.

### `v0.8.0` — GitHub Action

- Consume the same committed configuration, context, decisions, prompt contracts, and report schema
  as the Claude Code reviewer.
- Review pull-request diffs and publish a summary plus bounded inline comments.
- Always report advisory status and never block a pull request.
- Ask stakeholder-impact questions separately from confirmed issues.
- Expose structured outputs for finding count, highest severity, questions, reviewed dimensions, and
  context status.
- Use least-privilege GitHub permissions and never write context or decisions from CI.

Exit: a repository can run the same CCR review locally and in CI with consistent, traceable results.

### `v0.9.0` — Full-pack pilot hardening

- Pilot in real educational software repositories.
- Evaluate the context system, Claude reviewer skills, and GitHub Action together.
- Record setup time, context accuracy, review precision, unanswered-question usefulness, false-stale
  warnings, conflicts, context size, and corrections.
- Remove unused settings and workflows.
- Stabilize context, decision, prompt, finding, report, and configuration schemas.
- Add migrations, compatibility checks, complete installation guidance, and rollback tests.

Exit: pilot teams can install, configure, review, update context, use CI, upgrade, and remove CCR
without maintainer assistance.

### `v1.0.0` — Complete CCR pack

- Ship the versioned Claude Code plugin with setup, configuration, context management, reviewer
  skills, feedback handling, status, validation, and uninstall.
- Ship the GitHub Action using the same review contracts and research-backed dimensions.
- Publish supported schemas, migration guarantees, privacy boundaries, compatibility, and release
  notes.
- Provide reproducible evaluation fixtures for context accuracy, finding quality, deduplication, and
  non-repetition.
- Freeze the minimum commands and outputs required by both local and CI workflows.

Exit: a new educational-software repository can configure CCR, generate and maintain context, review
changes locally, run equivalent advisory review in GitHub Actions, capture human-approved decisions,
and upgrade safely as one coherent product.

## Required tests

- Unit: configuration merge, path exclusions, routing, limits, fingerprints, journal selection, and
  compaction invariants.
- Integration: setup preview/apply/idempotency, existing-file preservation, update classification,
  decision approval, and hook installation/removal.
- E2E: fresh clone, Windows/Linux paths, multiple branches, worktrees, rebase, direct Git use,
  Claude-driven commit, secret exclusions, corrupt config, interrupted update, and uninstall.
- Golden fixtures: small, monorepo, non-JavaScript, existing Claude setup, and sensitive-data repo.

## Success measures

- Median confirmed setup takes less than five minutes.
- Default always-loaded CCR context stays below 2,000 tokens.
- No secrets from excluded paths enter generated context in tests.
- No default Git action is blocked by CCR.
- No repeated unchanged warning appears more than once per session.
- Shared context changes produce no journal merge conflicts.
- At least 90% of pilot context statements are accepted without correction.
- Every generated shared statement has a live path, symbol, command, decision, or Git trace.

## Deferred until its roadmap phase

- Ethical-review prompts and issue severity scoring until `v0.5.0`
- Multi-dimension reviewer agents and aggregation until `v0.6.0`
- Feedback-driven decision proposals until `v0.7.0`
- GitHub Action findings and PR comments until `v0.8.0`
- Cross-domain support beyond education
- Vector search or embeddings
- Automatic decision approval
- Learning from developer silence
- Automatic LLM execution inside Git hooks
- Blocking commits based on findings
- Nested or unlimited subagent trees
- AST dependency graphs and historical co-change scoring

## Documentation basis

- [Claude Code memory and instruction loading](https://code.claude.com/docs/en/memory)
- [Claude Code extension choices](https://code.claude.com/docs/en/features-overview)
- [Claude Code plugins](https://code.claude.com/docs/en/plugins)
- [Claude Code settings scopes](https://code.claude.com/docs/en/configuration)
- [Claude Code skills](https://code.claude.com/docs/en/slash-commands)
- [Claude Code subagents](https://code.claude.com/docs/en/sub-agents)
- [Claude Code hooks guide](https://code.claude.com/docs/en/hooks-guide)
- [Claude Code hooks reference](https://code.claude.com/docs/en/hooks)
- [Claude Code headless operation](https://code.claude.com/docs/en/headless)
- [Git hooks](https://git-scm.com/book/en/v2/Customizing-Git-Git-Hooks.html)
