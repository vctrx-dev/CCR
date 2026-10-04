# CCR User Manual

CCR uncovers ethical and inclusivity bugs developers may not have anticipated, including harmful
assumptions in code that works as intended. Reviews explain human consequences in plain language
with supporting evidence; they are advisory, not general engineering audits.
Requires Node.js 22.12+, Git, and Claude Code 2.1.0+ installed and signed in. Slash skills run in
Claude Code; `ccr` commands run in a terminal. Examples below use a global installation.
For project-local installs, use `npx ccr` or `pnpm exec ccr` instead of bare `ccr`.

## Install and setup

Install globally, then run setup in each project's Git repository:

```bash
npm install --global @vctrx/ccr@latest
ccr setup
```

`@latest` always installs the newest release. CCR is in beta (0.x): a minor release may include
breaking changes, which [CHANGELOG.md](CHANGELOG.md) describes with any migration steps.

For a project-local installation, run these in the repository instead:

```bash
npm install --save-dev @vctrx/ccr@latest
npx ccr setup
```

With pnpm, use `pnpm add --save-dev @vctrx/ccr@latest` and `pnpm exec ccr setup`.
Install the package before running `npx ccr`; otherwise npx may download a different package named
`ccr`. Installation alone creates no context or hooks.

Setup creates configuration, skills, context skeletons, and editable taxonomy, preserving existing
human-owned files. A separate `ccr config init` is not needed for first-time setup; use it to create
or upgrade configuration and its manual independently. `setup`, `update`, and
`uninstall` apply by default; `--dry-run` or `--json` previews without writes. Repeating setup is safe.

For a global upgrade, run `npm install --global @vctrx/ccr@latest`, then `ccr update` in each
repository. For a local upgrade, run `npm install --save-dev @vctrx/ccr@latest`, then
`npx ccr update`. With pnpm, use `pnpm add --save-dev @vctrx/ccr@latest` and `pnpm exec ccr update`.
Update refreshes marked skills, resources, instruction
blocks, and untouched taxonomy defaults; it preserves configuration, custom taxonomy, context,
journals, private state, and unrelated files. Foreign or malformed managed skills stop the update.
Setup does not invoke repository-resolved Claude, commit, or push.

## Configure

Edit strict JSON directly or run `ccr config set <key> <value> [--dry-run]`, then `ccr config validate`.
Use `ccr config defaults` for the full defaults and `.ccr/config-manual.md` for installed guidance.

| Setting | Default | Meaning |
|---|---|---|
| `domain` | `"unspecified"` | Product-domain label, 1–80 characters |
| `hooks.enabled` | `true` | Enable repository-native advisory integration |
| `hooks.checkBeforeCommit` | `true` | One-line pre-commit note when reviewed uncommitted work changed before commit; with `hooks.enabled`, also turns on background context updates after each commit |
| `context.recentJournalEntries` | `1` | Read 1–10 recent non-empty entries besides the active journal |
| `instructions.updateClaudeMd` | `true` for new setups | Maintain a CCR pointer block in `CLAUDE.md` |
| `instructions.updateAgentsMd` | `true` for new setups | Maintain a CCR pointer block in `AGENTS.md` |
| `privacy.excludedPaths` | No extra paths | Up to 100 additional privacy globs; edit JSON directly |

```bash
ccr config set hooks.enabled false
ccr config set context.recentJournalEntries 3
ccr config validate
```

Fixed in code and not part of `config.json`: background context updates are on whenever
`hooks.enabled` and `hooks.checkBeforeCommit` are both `true`, `/ccr-context compact` removes at
most 25%, and reusable human review rationale may always be appended to decisions. Older files
that still contain `hooks.autoUpdateContext`, `context.maxCompactionPercent`, or
`instructions.updateDecisionsMd` stay valid; those keys are ignored.

Run setup after changing instruction-pointer settings. Sync hooks after enabling them; remove them
after disabling. Other settings apply on the next operation. Existing privacy exclusions survive
legacy upgrades and unrelated edits.

Configuration is human-owned: agents need approval of the exact setting and value. The only automatic
exception is initial domain inference: `/ccr-context initialize` conditionally replaces the untouched
generated `"unspecified"` default with an evidence-backed label, or `general-software` when no more
specific domain is established. Human-set domains and later operations remain unchanged.

Shared and local config must be valid, NUL-free UTF-8 within 64,000 characters. Syntax diagnostics
never quote private input. Applied updates serialize with managed lifecycle operations and preserve
concurrent changes through exact-content comparisons.

## Initialize and maintain context

```text
/ccr-context initialize
```

Initialization investigates the repository, asks material project/stakeholder questions in the same
chat, and waits for answers. You can skip or answer “unknown”; useful uncertainty remains a limitation,
not invented certainty. Answers become plain-language context, not transcripts or question backlogs.
Initialization pauses if a necessary reply is unavailable and syncs enabled hooks when proceeding.

| File | Ownership and purpose |
|---|---|
| `.ccr/project.md` | Purpose, people's activities, rules, choices, safeguards, and limits; later agent updates only for verified durable changes or confirmed plans |
| `.ccr/stakeholders.md` | Roles, goals, circumstances, effects, and ability to question decisions; human-owned and read-only to CCR after initialization |
| `.ccr/decisions.md` | Human rationale; initially empty, normally append-only under the separate setting |
| `.ccr/dimensions.json` | Shared, editable review taxonomy |
| `.ccr/journal/` | Local work/commit/PR continuity, ignored by Git |

Write context for a non-technical ethical reviewer. Include indirectly affected people, existing
safeguards, uncertainty, and clearly labeled plans. Verify claims against sources, but keep paths,
commands, technical citations, and internal mechanics out of shared narrative. Journals may keep a
separate minimal Supporting references section. Context is background—not a bug list or proof of
fairness—and source, tests, and schemas outrank it. Review the resulting `.ccr` changes before use.

| Skill | Use |
|---|---|
| `/ccr-context update` | Complete the journal; change project context only for durable facts |
| `/ccr-context verify` | Check context against current evidence |
| `/ccr-context addition` | Incorporate supplied knowledge or labeled plans |
| `/ccr-context compact` | Shorten project context by at most 25%; leave stakeholders and decisions alone |
| `/ccr [question]` | Get help from installed CCR sources |

`context validate` and `context status` report `unfilled`, `populated`, or `invalid` readiness.
Populated/valid does not mean fact-verified. Managed Markdown context validation rejects content
beyond 10,000 UTF-16 characters; shared reads mark truncation at that limit. Inspect full local files
before relying on omitted content.

## Review selection

```text
/ccr-review [changes|codebase|PR-<number>] [all|dimension [<id> ...]|<id> ...]

/ccr-review
/ccr-review codebase dimension data-system-reliability
/ccr-review codebase data-system-reliability alignment-with-teaching-learning
/ccr-review codebase dimension
/ccr-review codebase privacy-data-protection
/ccr-review PR-123 fairness-non-discrimination, privacy-data-protection
```

Missing scope means `changes`; missing selection means `all`, which reviews every configured
dimension. A dimension is a review category, such as Data & System Reliability. The optional
literal keyword `dimension` introduces one or more space- or comma-separated dimension IDs; bare IDs also
work. `/ccr-review codebase dimension data-system-reliability` reviews the whole codebase only
for that dimension and all its criteria. Selecting a file scope does not change the dimension
selection. Every ID in the effective taxonomy is selectable individually or in a subset, including
custom IDs. Every operation rereads authoritative JSON: repository `src/review/dimensions.json`
first, otherwise customized `.ccr/dimensions.json`, otherwise on-disk package JSON defaults.

`/ccr-review codebase dimension` without IDs lists every available ID and display name, asks which
dimension(s) to review, and waits for your answer before investigating or writing a journal. Your
answer retains the requested scope and is validated against the current taxonomy; this request
never defaults to `all`. The same chooser works with changes or PR scope.

Selectors without a scope are a changes-review shorthand. Duplicate IDs, empty comma-separated items,
mixed `all`, invalid PR numbers, and unrelated arguments stop before
investigation or journal writes; an invalid selection never falls back to `all`.

- **changes:** approved staged, unstaged, and untracked work.
- **codebase:** complete safe Git index plus approved live changes, not only changed lines.
- **PR:** immutable GitHub base/head metadata, patch, and relevant head content. Requires authenticated
  `gh`; no checkout, fetch, branch mutation, or local-worktree substitution.

One agent reviews all selected criteria without delegation. Skills tolerate unique minor misspellings
of operations, scopes, or effective dimension IDs; ambiguity asks one focused question. PR numbers,
paths, settings, flags, terminal commands, and free-form input are preserved exactly. Claude Code
resolves slash-skill names before CCR receives their arguments.

### Stakeholder-impact review

A finding needs affected people, an evidenced product rule or assumption, a credible consequence,
and counterevidence checks. Trace whose participation, opportunity, identity, privacy, or agency
changes and whether safeguards or human correction address it. Plausible scenarios are labeled as
hypothetical; do not invent measured disparities, community reactions, or outside policies.

Technical mechanisms can qualify: rejecting a legitimate name or blocking a keyboard-only exam task
can establish exclusion. Eventual completion does not erase unequal participation burden. Routine
correctness, security, performance, or UI faults alone do not qualify. Wording is assessed in context,
not by keyword. Missing evidence remains unconfirmed, not a bug or proof of safety; material unknowns
are kept in the journal, not a trailing question section.

Useful review lenses include a source's worldview becoming assessment authority, automation rewarding
easy-to-score answers over learning, harmful patterns that nobody can discover, and learners carrying
the full burden of contesting a consequential decision. Check relevant stakeholder circumstances
without treating demographic groups as fixed traits. Indicators are not an exhaustive checklist.

Reports open with `Context applied`, identifying relevant decisions and earlier findings. Each finding
has its own heading, numbered from 1, with blank lines between fields and a horizontal separator:

```text
### 1. Short finding title

Severity: Critical, High, Medium, or Low

Dimension / criterion: applicable names

Finding and affected people.

Scenario: realistic or hypothetical example

Evidence: path, rule, function, or behavior

---

### 2. Next finding title
```

Findings are sorted most severe first. With `all`, supported ethical/inclusivity issues outside the
taxonomy appear in that same list as `Other — outside current dimensions`, not a separate section.
With specific dimension IDs, investigation and findings stay within those dimensions, and outside
issues are omitted. Ordinary engineering defects still do not qualify. Omit Question/Context sections, trailing observations,
coverage tables, file inventories, rejected candidates, and unsolicited fixes. Existing journal
identities stay stable for follow-ups; each completed report's display numbers restart at 1.
“No supported inclusivity bugs found.” is valid. Put any necessary evidence-limit, context-edit, or
continuity-failure disclosure before the findings, not in a trailing section. Reviews never modify
source without approval.

The review loads a current Markdown reference with `ccr context dimensions --reference`. It links
dimension/criterion names to `.claude/skills/ccr/references/dimensions.md` only when that installed
entry's names and wording still agree with live JSON; other names remain unlinked. Setup/update
generates the installed reference from the current effective taxonomy, and builds generate the
packaged reference from source JSON. Markdown never overrides JSON. Links use actual matching
headings or viewer-supported lines; how they open depends on the Claude Code editor/viewer.

## Editable review taxonomy

JSON is the sole taxonomy source of truth. Every review, selection, save, and freshness check loads
it through the same reader. Repository `src/review/dimensions.json` takes precedence when present;
otherwise customized `.ccr/dimensions.json` applies. If the repository JSON is absent or is an
untouched setup copy, defaults are reread from the running package's source JSON when available,
otherwise its shipped `dist/review/dimensions.json`. Compiled constants are API snapshots and are
never the live reader's fallback.

Edit and commit the authoritative JSON. Edits affect the next command without rebuilding,
rerunning setup, or rewriting skills. `ccr context dimensions --json` returns the effective registry;
`--reference` renders a current Markdown reference. Help points to this live lookup rather than
embedding a list captured at build time. Setup/update refreshes derived references automatically.

Each dimension has `id`, `name`, `summary`, and a nonempty `criteria` array. Each criterion has `id`,
`name`, and `details`; questions/indicators belong in summary or details. Dimension IDs are lowercase
kebab-case. Criterion IDs allow alphanumeric hyphen-separated segments, including uppercase research
labels. IDs must be unique within their respective scopes; registry order controls presentation.

| Workbook ID | Dimension | Packaged selector | Criteria |
|---|---|---|---|
| CCR-D1 | Data & System Reliability | `data-system-reliability` | 5 |
| CCR-D2 | Alignment with Teaching & Learning | `alignment-with-teaching-learning` | 4 |
| CCR-D3 | Fairness & Non-Discrimination | `fairness-non-discrimination` | 4 |
| CCR-D4 | Inclusion & Accessibility | `inclusion-accessibility` | 3 |
| CCR-D5 | Transparency & Explainability | `transparency-explainability` | 3 |
| CCR-D6 | Privacy & Data Protection | `privacy-data-protection` | 6 |
| CCR-D7 | Human Control & Review | `human-control-review` | 3 |

The baseline follows `CCR_v5_7_review.xlsx`, preserving seven dimensions, 28 criteria, and research
IDs as metadata. Criterion IDs are omitted from prompts. Older shorthand selectors, including
`fairness-evaluation` and `system-integrity`, are retired, not aliases. The framework is guidance,
not empirically validated or comprehensive ethical/accessibility certification.

Optional `_ccr` metadata records `schemaVersion` and the original `defaultSha256`. Leave it unchanged
while customizing the payload. Untouched copies follow current package defaults even before update;
update refreshes those copies but preserves customized files and human-authored JSON without
metadata. To resume defaults, back up the file, remove only
`.ccr/dimensions.json`, and run setup. Ordinary uninstall preserves it; `--remove-context` removes it.

Invalid authoritative JSON/schema, symlinks, non-UTF-8 input, and files
over 256,000 characters fail closed, including lifecycle previews. An empty dimension array stops
review. Never include secrets or private records. Taxonomy edits invalidate review freshness.

Package contributors edit only `src/review/dimensions.json` for taxonomy changes. An existing
installation running against that checkout adopts the changes on its next command without a
build or update. `pnpm build` packages the JSON for distribution and generates Markdown; watch
rebuilds reread source JSON too. No manual edits to selection logic or generated files are required.
Customized consumer taxonomies are preserved unless the repository also supplies source JSON,
which takes precedence.
Default data ships at `dist/review/dimensions.json` and is exported as `@vctrx/ccr/dimensions.json`.
The workbook table above describes the baseline; use `ccr context dimensions --json` for current
IDs, names, and criteria. Target customization requires no package build or documentation edits.

## Journals, freshness, and decisions

Work, commits, and PRs reuse their respective journal identities. Working entries omit Branch/Commit
until commit finalization; separate commits and PRs keep separate entries. A commit always adopts
the pending working entry, even when other work stays uncommitted; `git commit --amend` moves the
entry to the amended commit; rebases and multi-commit cherry-picks are skipped; context-only commits
create no entry. UTC date filenames use
numeric same-day suffixes. `Started` is fixed, `Updated` advances, and filenames stay stable across
days. Valid legacy `Timestamp` headers migrate when reused.

After a review, subsequent explanations, feedback, approved fixes, and checks amend the same active
account before responses. Each finding gets one concise 40–80 word bullet with its label, severity,
dimension, affected people, cause, consequence, status, and reason—a summary, not a copy of the
report—so the entry is understandable days later. Keep next steps without empty categories or
transcripts. The short CLI save summary is not the full session account. Follow-up
work does not count as a fresh review. This is skill-guided continuity, not a background listener.

New work after a clean-tree review or partial commit carries a bounded historical summary and link,
not prior completion receipts. Concurrent sessions reread and preserve one another's work. Recent
journals are selected repository-wide by validated `Updated`, then `Started`, then path, skipping
untouched placeholder entries. The active
journal is always read separately and consumes no recent-history slot. Long previews prioritize
current findings and next steps and explicitly mark omissions.

- **Freshness context:** project, stakeholders, decisions, effective taxonomy, domain, and privacy
  exclusions. Other journals and operational settings such as hooks do not make a review stale.
- **Input-context fingerprint:** full configuration, shared context, complete active journal, and
  supplied recent-journal previews. Unread historical tails are not inputs. Content hashes detect
  edits even when file size and timestamps stay unchanged.

Local reviews capture `context review-state` before discovery and pass its values to
`context save-review --expected-state <fingerprint> --expected-context <fingerprint>`. Changed code
or shared context refuses recording. Before saving, consider any changed journal feedback and pass
its acknowledged `inputContextFingerprint` as `--expected-input-context <fingerprint>`; PR saves
may use this input guard too. Refreshing the acknowledged hash does not replace the original
code/context pair without reassessment. The optional input guard runs before the save's own journal
writes, not as full transaction isolation or a rule that later journal activity makes reviews stale.
New saves validate selections against the live taxonomy; old journal records remain readable.
Re-recording the review's own context edits through
`context record-review-state` requires unchanged code and a complete current local journal; PR,
old-branch, old-HEAD, malformed, oversized, placeholder, or concurrently edited entries are rejected.
When context-only edits move a clean-HEAD review into a working journal with no run, explicitly use
`--continue-from <former-HEAD-journal>` on the working target. This retains the verified run's original
time and scope and leaves the source receipt untouched; it is not a newly completed review. The
source must still represent this branch's current HEAD, and reviewed code must be unchanged.
PR summaries retain the reviewed head. Later changes produce advisory stale-review reminders.

Context assessment is separate from review completion. Use values from `context review-state` with
`context assess <code-fingerprint> <context-fingerprint> <summary>` after assessing local work,
including when no context edit is needed. For an existing commit, add `--commit <full-HEAD-sha>` to
both commands; the commit must remain current HEAD. Receipts are branch-specific, evidence-bound,
and do not certify later changes. An arbitrary shared-file edit is not an assessment.

Decisions capture missing, reusable human rationale from review feedback—not conclusions inferred
from code, bare disagreement, accepted risk, or a fix request. When authorized, use
`ccr context append-decision <decision>` for a bounded append; context operations append at most one.
Record reason, scope, and assumptions, including human-described outside practices. Check code-related
claims and keep contradictions visible. With capture disabled, keep the reason in the local journal.
Future reviews apply the rationale while its conditions hold; changed conditions can justify a new
finding. Only an explicit human request authorizes decision reconciliation/compaction: show the diff,
preserve applicable rationale and superseded-rule history, and validate.

## Hooks

Setup installs `/ccr-hooks`, not hook files. With `hooks.enabled: true`, initialization invokes
`/ccr-hooks sync`, which selects the least invasive compatible native/framework integration.
`/ccr-hooks status` inspects it; `/ccr-hooks remove` removes only owned integration.

Hooks are quiet by design. Pre-commit prints one short line only when this uncommitted work was
reviewed and then changed before commit; an earlier commit's review never triggers it. Post-commit adopts or creates the commit journal and marks stale reviews. When
no review or context update already covered the commit, it starts the background update (or, with
automatic updates off, prints one `/ccr-context update last commit` line). A commit made only of
reviewed, unchanged files counts as covered even when other changes stay uncommitted. Hooks never
rewrite or stage source, retry Git, or block commits for findings. Missing/invalid configuration fails visibly rather than disabling
checks. `ccr hooks pre-commit` and `post-commit` are the handlers; `check` and `after-commit` are
hidden compatibility aliases.

Provenance records original byte counts/hashes and managed separators for verified restoration.
While it exists, `/ccr-hooks` owns status/removal; CLI uninstall defers. Marker-only hooks without
state are legacy/unprovenanced, not safely adoptable. Invalid state blocks automatic changes.
After inspection, `ccr hooks uninstall` removes legacy blocks while preserving unrelated bytes.
Use `ccr hooks status` and `ccr config validate` to investigate failures.

### Automatic updates

Automatic updates run while `hooks.enabled` and `hooks.checkBeforeCommit` are both `true`, and
require authenticated Claude Code.
Post-commit starts a detached background run and returns immediately; a run for a quick successive
commit waits for the previous one. If a run fails, the next commit prints one short line. CCR uses an exact immutable HEAD packet under ignored
`.ccr/private/`, limited to 200 approved paths, 200,000 retained characters, and 512,000 final bytes.
Each file includes content and parent-to-commit diff; merge commits use the first parent and root
commits the empty tree. Resolved-policy changes invalidate the operation-local approval.

Headless Claude has only restricted `Read` and `Edit`: approved CCR inputs and that packet; writes
only to the exact commit journal, project context, and one normalized nonduplicate decision append
when enabled and supported by explicit human rationale already in the journal. No shell, raw-source
search, tasks, MCP, hooks/settings access, Git mutation, or session persistence. Config, stakeholders,
other journals, and unauthorized ignored paths remain unchanged.

Completion requires the commit to remain in the branch history, a structurally complete exact-commit
journal, valid context, and no unauthorized CCR edits; Claude's tool allowlist denies source edits,
so developer edits made meanwhile are expected. CCR sets `Updated`, records bounded idempotency state,
and leaves changes unstaged. It never stages, commits, amends, resets, or pushes. Failure is
non-blocking; a review narrative alone cannot skip assessment.
Normal success/failure attempts conditional packet cleanup; tampering, unavailable locks, or abrupt
termination can leave an ignored packet for manual removal. Live locks do not expire with duration;
dead owners/old empty containers are safely reclaimable, replacement owners are protected, and
ambiguous state requires human repair.

## Terminal reference

Use `ccr help <command>` or `ccr <group> --help` for full syntax. `-v`, `-version`, and `--version`
print the installed version.

| Command | Purpose |
|---|---|
| `ccr context status` / `validate` | Inspect structural validity and readiness |
| `ccr context dimensions [--json|--reference] [--select <all-or-IDs>]` | Read live JSON, selected lenses, or a current Markdown reference |
| `ccr context changes` | List approved staged paths |
| `ccr context files [prefix] [--after <path>]` | Page through safe index files |
| `ccr context read <file>` | Read an approved index blob |
| `ccr context diff <file>` | Read an approved staged diff |
| `ccr context shared <file>` | Read current project, stakeholder, or decision context |
| `ccr context recent` | List safe recently changed paths |
| `ccr context journal` | Ensure a working journal |
| `ccr context journals [PR-<number>]` | Read global recent history excluding the selected active entry; never PR-scoped history |
| `ccr context commit-changes <HEAD> [--after <path>]` | Page through approved current-commit paths |
| `ccr context commit-read <HEAD> <file>` | Read a bounded immutable changed blob/deletion marker |
| `ccr context review-changes` | List approved live review paths |
| `ccr context review-diff <file>` | Read approved live review evidence |
| `ccr context review-state [--commit <HEAD>]` | Fingerprint code and context for local work or the exact current commit |
| `ccr context review-context-state [PR-<number>]` | Fingerprint supplied inputs and freshness context |
| `ccr context assess <code-fingerprint> <context-fingerprint> <summary> [--commit <HEAD>]` | Record an evidence-bound context assessment |
| `ccr context save-review <scope> <dimensions> <critical,high,medium,low> <summary> [--expected-state <fp> --expected-context <fp>] [--expected-input-context <fp>]` | Save a finished review; optionally check acknowledged journal inputs |
| `ccr context record-review-state <journal> <fingerprint> <context-fingerprint> [--continue-from <HEAD-journal>]` | Re-record unchanged code; explicitly continue a HEAD review after context-only edits |
| `ccr context review-pr PR-<number>` | Read bounded immutable PR metadata/patch |
| `ccr context review-pr-head PR-<number> <files...>` | Read up to eight approved PR head files |
| `ccr context review-journal [PR-<number>]` | Ensure the active work/commit/PR journal |
| `ccr context append-decision <decision>` | Append one authorized human decision |

## Privacy and lifecycle safety

Commit shared config, taxonomy, project, stakeholders, and decisions. Keep local configuration,
journals, private state, cache, and temporary files ignored. Never put secrets, credentials,
personal records, or raw private discussions in shared files. Mandatory exclusions always apply;
optional privacy globs add restrictions. Symlinks, submodules, binary/invalid text, and oversized
evidence are rejected or explicitly omitted—not silently treated as complete empty input. Listings
with omissions supply a continuation cursor. Approved Git filenames are literal, including wildcards;
PR approvals and net diffs use the same immutable comparison, including rename sources.

Managed lifecycle writes use a shared lock and exact-content comparisons. A human edit observed
after preview stops the operation instead of being overwritten/deleted. Cooperating writers serialize;
direct editors can still race after comparison, so avoid manual edits during apply. Interrupted
multi-file operations are idempotent and can be rerun. Uninstall also protects journal creation
behind the global journal barrier.

## Uninstall

First run `/ccr-hooks remove` for provenance-managed integration. Then:

```bash
ccr uninstall --dry-run
ccr uninstall
# Only when shared context should also be deleted:
ccr uninstall --remove-context
```

Ordinary uninstall preserves shared context, custom taxonomy, journals, and private state. The
explicit flag removes shared context only. Real local content protects its ignore rules; empty
internal lock scaffolding alone does not. Unknown framework integration is not claimed as removed.

After removing integration from every repository that uses the installation, remove the package
with `npm uninstall --global @vctrx/ccr`. For a local installation, run `npx ccr uninstall` before
`npm uninstall @vctrx/ccr`; with pnpm, use `pnpm exec ccr uninstall` before `pnpm remove @vctrx/ccr`.

## Programmatic use and contributor checks

Supported entry points are `@vctrx/ccr`, `/context`, `/review`, and `/llm`; root exports support
ESM/CommonJS, focused subpaths ESM only. Imports alone never mutate repositories or contact a provider.
Use `readReviewDimensionRegistry(root)` and `renderReviewDimensionSections(registry)` from the review
entry point for live taxonomy. Do not depend on private source paths.

Contributors run `pnpm verify`: safety, audit, typecheck, lint, coverage, build, and package smoke.
Typecheck rejects unused source locals/parameters; test-only helpers and public exports require
caller checks before removal. In the source checkout, `pnpm test:prompt` prints the first dimension's
standalone prompt without installation or a model call. Use `/ccr-review codebase all` in Claude Code
for an installed all-dimension review. See [TEST.md](TEST.md) for the test workflow.
