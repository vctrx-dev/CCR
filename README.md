# CCR — Critical Code Reviewer

To experiment with the first review dimension, run `pnpm test:prompt` in this source repository.
Copy the printed prompt into Claude Code in your target repository. Edit the shared prompt and rerun;
no build, installation, skill invocation, or LLM call is needed to generate it. See TEST.md for files.

CCR is research-backed tooling for maintaining concise, human-correctable context used by code
review workflows. The first package targets Claude Code while keeping its repository
context as plain Markdown and JSON.

The complete product combines:

- compact product-impact context management;
- research-backed Claude Code reviewer skills;
- branch-local continuity;

The staged roadmap reaches `v1.0.0` by expanding and validating the review taxonomy, then shipping
the advisory GitHub Action on top of the current context and review-skill foundations.

## One package, optional components

CCR uses one package: `@vctrx/ccr`. Installing it makes every available CCR command accessible, but
the developer chooses which components to enable:

| Component | Enable it | Optional? |
|---|---|---|
| Editable settings and configuration manual | `ccr config init` | Yes |
| Claude manual, context skill, and shared context | `ccr setup` | Yes |
| Unified review skill | `ccr setup`, then `/ccr-review` | Yes |
| Advisory context hooks (pre-commit + post-commit) | `hooks.enabled: true` (default) plus `/ccr-context initialize` or `/ccr-hooks sync` | Yes |
| `CLAUDE.md` or `AGENTS.md` pointer | Enable its config setting before setup | Yes |
| Local continuity journal | Created by `/ccr-context` operations when needed | Yes |

Setup and update apply safe managed changes by default; use `--dry-run` or `--json` for a
non-mutating preview. Uninstall also applies by default while preserving shared context; add
`--remove-context` only when those shared files should be deleted. The GitHub Action remains a later
opt-in component.

An uncommitted working journal is titled `CCR Journal` and contains no Branch, Commit, or changed-path
metadata. New journal filenames use the UTC calendar date (`YYYY-MM-DD.md`); additional entries on
the same date receive numeric suffixes. `Started` records creation and never changes; `Updated`
advances whenever CCR reuses, completes, finalizes, or amends the journal. The filename remains stable
when one change spans several days. The post-commit hook attaches Branch and Commit only after Git
creates the commit, reusing the working entry instead of creating a duplicate. Different commits get
separate journal entries, while repeated reviews of one commit reuse its entry. Each pull request has
one separate local journal entry that repeated reviews and human follow-up reuse. Each completed
review replaces the initial summary placeholder with a concise factual scope, evidence, and outcome
record. Changes and codebase reviews record deterministic fingerprints for the approved code state,
every bounded context input supplied to the review, and continuity-safe context. CCR verifies code
and review inputs immediately before reporting; later code or context edits trigger advisory
pre-commit and post-commit stale-review warnings. Older `Timestamp` metadata is migrated to
`Started` and `Updated` when reused.

## Install in a project or globally

Choose a project-local install when CCR belongs to the repository and should be available through its
package scripts. Choose a global install when you want the `ccr` CLI available across repositories.

### Project-local install

```bash
npm install --save-dev @vctrx/ccr
# or: pnpm add --save-dev @vctrx/ccr

npx --no-install ccr config init
npx --no-install ccr setup
```

Run `npx --no-install ccr help` to see all terminal commands, Claude Code skills, review syntax, and
currently configured dimension IDs. Use `npx --no-install ccr help <command>` or
`npx --no-install ccr <group> --help` for command-specific arguments. A bare `ccr` command requires
a global installation; project-local installs use the `npx --no-install` prefix. Use `ccr -v`,
`ccr -version`, or `ccr --version` to print the installed package version.

Hooks are controlled by the generated `.ccr/config.json`. Setup installs the repository-aware
`/ccr-hooks` skill; `/ccr-context initialize` invokes it when `hooks.enabled` is true.

### Global CLI install

```bash
npm install --global @vctrx/ccr
# or: pnpm add --global @vctrx/ccr

cd /path/to/your/repository
ccr config init
ccr setup
```

The global install provides the CLI. A project-local installation also exposes CCR's programmatic
API for Node.js integrations. Neither installation creates the shared `.ccr` context files or Git
hooks by itself.

## Programmatic API

CCR ships an ESM API for integrations that need the same validated configuration, managed-artifact
lifecycle, privacy-filtered evidence, review taxonomy, or provider contracts as the CLI. Import only
the documented package entry points—`@vctrx/ccr`, `@vctrx/ccr/context`, `@vctrx/ccr/review`, and
`@vctrx/ccr/llm`—rather than internal source paths. The root entry also supports CommonJS `require`;
focused subpaths are ESM-only so they retain shared chunks and avoid duplicating the full SDK.

```ts
import {
  createAsuAimlProviderConfig,
  DEFAULT_CONTEXT_CONFIG,
  resolveContextConfig,
} from "@vctrx/ccr";

const config = resolveContextConfig(DEFAULT_CONTEXT_CONFIG, {
  privacy: { excludedPaths: ["internal/**"] },
});
const provider = createAsuAimlProviderConfig({
  apiKey: process.env.ASU_API_KEY ?? "",
  model: "gpt-5.2",
});
```

The API never installs CCR, modifies a repository, reads repository evidence, or sends a provider
request merely because it is imported. Writes and evidence reads occur only through explicit API
calls and retain the same managed-path and privacy safeguards as the CLI.

CCR is published as [`@vctrx/ccr`](https://www.npmjs.com/package/@vctrx/ccr). To test an
unpublished build from this repository:

```bash
pnpm verify
npm pack
npm install --save-dev /path/to/vctrx-ccr-VERSION.tgz
# or globally: npm install --global /path/to/vctrx-ccr-VERSION.tgz
```

Then use the same project-local or global commands above.

Useful first commands:

```bash
npx --no-install ccr config defaults
npx --no-install ccr config init --dry-run
npx --no-install ccr setup
npx --no-install ccr setup --json
```

For an existing CCR installation, `ccr setup` preserves `config.json`. Run
`ccr config init --dry-run` to preview a minimal configuration upgrade, then run `ccr config init`
if the proposed settings are correct.

After updating `@vctrx/ccr`, run `npx --no-install ccr update`. It refreshes only
package-managed CCR skills, resources, and marked instruction blocks; configuration, shared context,
journals, private state, and user-owned files remain unchanged.

If review output uses the old `Issue:` format, check the installed skill and run
`npx --no-install ccr update` when outdated. Wrong output can also reflect instruction-following
failure; format alone does not establish a stale installation.

Reviews trace normal product rules, extract their hidden assumptions, and test realistic circumstances
from different stakeholder perspectives, including relevant cultural, language, financial, disability,
and racial contexts without stereotyping groups. They identify circumstances
where behavior excludes someone or changes treatment unjustifiably, including through validation or
accessibility failures. Findings include the premise,
counterexample, evidence, and counterevidence. Material unknowns appear as open questions. Novelty and
complete discovery cannot be guaranteed; an empty result does not establish ethical safety.

Every dimension uses the same single-agent review method: identify the specific rule, who could be affected
and when, how it changes their participation, opportunity, representation, or treatment, and which
safeguards or human correction exist. Reviews stay conservative: incomplete evidence becomes a question,
and finding no inclusivity bugs is a valid result.

Then open Claude Code:

| Command | Purpose |
|---|---|
| `/ccr [question]` | Answer doubts about installed commands, arguments, skills, dimensions, and safety boundaries |
| `/ccr-hooks sync` | Choose and apply the repository's native hook integration |
| `/ccr-hooks status` | Explain the active hook strategy and CCR checks |
| `/ccr-hooks remove` | Remove only CCR-managed hook integration |
| `/ccr-context initialize` | Set the untouched default domain once, populate product-impact and stakeholder context, then verify |
| `/ccr-context update` | Complete the current journal and update only durable product-impact context |
| `/ccr-context verify` | Check all context against the current index and latest five local commits |
| `/ccr-context addition` | Add human-provided plans, specifications, or other context |
| `/ccr-context compact` | Compact only project context by at most the configured 20–30% |
| `/ccr-review [scope] [all\|dimension,...]` | Review changes, the complete codebase, or `PR-<number>` without fixing them |

Inside a loaded CCR skill, obvious minor misspellings of an operation, review scope, or configured
dimension ID are normalized when exactly one valid choice is clearly intended. For example,
`/ccr-context initailize`, `/ccr-hooks statsu`, and `/ccr-review codbase privacy-data-protection` proceed as
`initialize`, `status`, and `codebase privacy-data-protection`. Ambiguous input asks one focused question instead of
guessing or writing. CCR never fuzzy-corrects PR numbers, paths, config keys or values, flags,
terminal commands, or free-form content. Claude Code resolves the slash-skill name itself before CCR
receives its arguments.

The review skill loads its taxonomy from the validated data-only
`src/review/dimensions.json` registry. Current review dimensions: `data-system-reliability`,
`alignment-with-teaching-learning`, `fairness-non-discrimination`, `inclusion-accessibility`,
`transparency-explainability`, `privacy-data-protection`, `human-control-review`.
The taxonomy follows `CCR_v5_7_review.xlsx`: seven dimensions and 28 criteria, preserving its names,
definitions, illustrative indicators, order, and dimension boundaries. Criterion IDs retain the
workbook's exact capitalization in registry metadata but are omitted from prompts. Boundary references
use criterion names instead of IDs. Dimension selectors follow the full workbook names in kebab-case.
The first dimension's criteria cover
data coverage, early warnings, model scope, instructional content checks, and failure recovery.
Fairness evaluation now belongs under `fairness-non-discrimination`; meaningful choice, challenges, and human
intervention belong under `human-control-review`. The retired `fairness-evaluation` and
`system-integrity` selectors are no longer accepted. See the user manual for the workbook-ID mapping.
Indicators are examples, not mandatory checks. Missing evaluation evidence is a gap, not proof of a
fault; the framework is not empirically validated and does not claim comprehensive coverage.
Blank arguments default to a changes review across all dimensions. Use `/ccr-review changes` for
clarity, `/ccr-review codebase` for the complete codebase, or `/ccr-review PR-123` for pull request
123. Put `all` or comma-separated dimension IDs after the scope, such as
`/ccr-review codebase privacy-data-protection, transparency-explainability`. A selector without a scope remains a changes review
as a supported shorthand. `npx --no-install ccr help` prints the IDs bundled in the installed
version. An empty registry stops a review and reports that condition instead of inventing criteria.
To add, delete, reorder, or revise dimensions, change the registry first; also update matching README
and user-manual references, then run package smoke to verify the shipped help and documentation
remain aligned.

## Stakeholder-impact review

During `/ccr-context initialize`, Claude asks project and stakeholder clarification questions in the
same chat and waits for your answers before finalizing `project.md` and `stakeholders.md`. Answers
become plain-language context, not a saved Q&A or an "Open questions" section. You can answer that
you do not know or skip a question; any important remaining limitation is stated plainly.

CCR is a socio-technical, stakeholder-impact review—not a conventional defect scan. It examines how
a product's assumptions, allocation of authority, decision rules, and feedback loops can harm,
exclude, mislead, or systematically disadvantage people even when every feature technically works.
Code, configuration, tests, and UI behavior are evidence for an impact pathway; a technical detail is
not a finding by itself.

A technical mechanism can establish exclusion: a required name rule rejecting a legitimate identity,
or an inaccessible exam interaction blocking participation, qualifies with concrete evidence. One
affected person can matter. Routine faults without a demonstrated participation or treatment impact
do not qualify. `test:prompt` still selects only the first dimension; name/access cases mainly belong
to inclusion, and unjustified scoring inputs to decision fairness.

A valid finding must depend on the target product's people and consequences: who is affected, what
product behavior or assumption creates the effect, how that effect can persist or compound, and what
repository evidence supports the claim. CCR does not report routine correctness, security,
performance, accessibility, or UI defects merely relabeled with a dimension. Such defects matter only
when evidence establishes a specific product-level stakeholder harm. See the
[stakeholder-impact review guidance](USER_MANUAL.md#stakeholder-impact-review) for the reporting bar
and illustrative examples.

`/ccr-review` works alone, without subagents or delegation. The same agent investigates every selected
dimension, using its summary and questions as discovery lenses rather than an exhaustive checklist.
It reads source, README, documentation, and `.ccr/project.md` and `.ccr/stakeholders.md` when present,
verifies candidates, merges duplicates, saves through CCR's review support, and reports.
Skill prompts describe goals and ownership rules in plain language. Claude chooses its tools and
consults installed help when needed, rather than following a prescribed terminal-command sequence.
Accessibility findings must identify the access need, blocked action or unequal participation barrier,
evidence, and equivalent-route check, even when someone eventually completes the task. Terminology in
interfaces, code, prompts, comments, documentation, and directory names is examined in context, not
by keyword alone. Failure recovery and privacy protection can qualify with a supported human
consequence under the criteria. Ordinary technical faults alone remain excluded. Source code is never changed
without later approval. `dimension-prompts.md` is the standalone, read-only whole-codebase test prompt.
Dimension prompts introduce the numbered criteria with “Review the code against these criteria:”.

Reports open with one `Context applied` line naming the recorded decisions and earlier open findings
that shaped the review, then contain `F1 [severity; dimension-id]` / `Scenario` / `Evidence` entries
and `Question` / `Context` pairs. Labels continue across follow-ups, so "F2 is intentional" refers to
the same journal entry. Coverage, file inventories, and progress narration are omitted. Findings are
sorted most severe first. "No supported inclusivity bugs found." is a valid result. Actual skill context
changes or failed continuity still receive a brief disclosure.

The dimensions are stakeholder-impact lenses, not buckets for ordinary engineering defects. They
examine, for example, whether the product treats one perspective as neutral authority, rewards
automation-friendly answers over defensible learning, makes unequal outcomes hard to discover, or
puts the burden of contesting consequential decisions on people with the least power. `privacy-data-protection` and
`data-system-reliability` apply when a system's information or operational behavior creates a concrete harm
pathway for people—not merely because a generic security or reliability flaw exists. The reviewer
reports one evidence-backed root cause with every applicable dimension instead of duplicating it.
Changes and codebase reviews capture `context review-state` before discovery and pass its
fingerprints to `context save-review --expected-state <fingerprint> --expected-context <fingerprint>`,
which refuses code or context edited during the review instead of recording it as reviewed. Freshness
covers code, `project.md`, `stakeholders.md`, `decisions.md`, the domain, and privacy exclusions;
other journals and operational settings such as hooks do not make a review stale. When the review's
own follow-up edits shared context, `context record-review-state` re-records the run while the code
is unchanged and refuses once code changes. Recording also refuses a PR, old-branch, old-HEAD,
placeholder, incomplete, or concurrently modified journal. PR runs record the reviewed head in their
summary so a later run can focus on newer commits.

After `/ccr-review`, Claude maintains the active journal before each subsequent response in that
session, including explanations, human feedback, requested fixes, and verification results. The
entry is a living summary: each issue has a stable label, impact, disposition, and supporting reason;
useful work, decisions, and next steps are included without empty status categories or transcripts.
Claude reads shared context and recent journals before reviewing and reloads relevant context when
needed. It may update `project.md` for durable facts or confirmed plans and capture missing human
review rationale in `decisions.md` when `instructions.updateDecisionsMd` permits it (the default for
new setups). It proposes, but never applies, `stakeholders.md` edits for a human, and after a local
review it records a context assessment so pre-commit does not ask again. It does not open or search
privacy-excluded files. Most turns update only the journal. Follow-up
work does not count as a fresh review. Continuity is skill-driven, not a background conversation
listener; branch/PR changes and new review targets follow CCR's existing journal identity rules.

Working journals carry a bounded historical summary and a link when work continues from a reviewed
commit or a partial commit. Previous review and assessment receipts are not transferred. Review
inputs always include the active journal, even outside the configured recent selection. Long journal
previews reserve space for the latest summaries, findings, and next steps and explicitly mark omissions.

`ccr context validate` checks structure and reports `unfilled`, `populated`, or `invalid` readiness;
populated does not mean fact-verified. After considering whether shared context needs changing,
For assessment after a commit, use `ccr context review-state --commit <full-HEAD-sha>` and
`ccr context assess <code-fingerprint> <context-fingerprint> <summary> --commit <full-HEAD-sha>`.
Both commands require that exact commit to remain current HEAD. This assesses the committed changes,
not an empty working tree. PR evidence approval and its net diff use the same immutable comparison.

Claude can record that assessment—even when no edit is necessary—with
`ccr context assess <code-fingerprint> <context-fingerprint> <summary>`. Fingerprints come from
`ccr context review-state`; changed evidence rejects recording. Receipts are kept per branch, so
assessing another branch does not discard one. Commit reminders consult that
receipt rather than treating an arbitrary shared-file edit as proof of assessment. Automatic updates
write a separate completion receipt only after all postconditions pass; review prose alone never
means automatic context assessment succeeded.

Decisions remain append-only during normal review. An explicit human request may authorize
reconciliation or compaction of decisions: show the diff, preserve applicable rationale and a concise
superseded-rule history, and validate. Ordinary project compaction does not grant that permission.

For pull requests, `context review-pr` establishes the immutable base/head identity; an optional
`context review-pr-head` call supplies approved surrounding head content. Both respect configured
privacy exclusions, and neither mutates remote or local Git state.

Initialization works in one agent and writes plain-language background for an ethical review.
`project.md` explains the purpose, how people use the software, who its results affect, and the rules
and assumptions shaping their choices, access, learning, privacy, and opportunities. Implementation
details, paths, commands, and technical citations stay out of shared context prose. Journals may keep
minimal supporting references separately from their readable account. Facts are verified against sources before writing; the account
is for a non-technical ethical reviewer. Package-managed continuity metadata is preserved.
`stakeholders.md` describes each supported role's goals, activities, circumstances, possible effects,
and ability to understand or challenge decisions, including people who never use the software directly.
Both files keep existing safeguards, unknowns, and future plans clear. They may be short or detailed
as needed; neither is a bug list or a claim that the product is fair.
After initialization, stakeholder context remains human-owned and read-only to CCR. Interactive and
automatic project updates follow the same writing guidance. Review the resulting context before use.

`ccr config init` creates or upgrades the configuration and manual. Use
`ccr config init --dry-run` to review the proposed operation without writing. After it succeeds,
`.ccr/config-manual.md` explains every key in the same order as `.ccr/config.json`. Edit
`.ccr/config.json` directly or use `ccr config set <key> <value>`, validate it, and then run setup.
The initialization creates `.ccr/config.json` and `.ccr/config-manual.md`. `ccr setup` then creates
`.ccr/project.md`, `.ccr/stakeholders.md`, and an empty `.ccr/decisions.md` as shared context. The initial
`/ccr-context initialize` prompt fills the context from repository evidence and, when `domain` is still
the generated `"unspecified"` default, records one evidence-backed product-domain label. It is not the
command that creates the `.ccr` folder structure. Setup preserves existing context and instructions,
executes no repository-resolved Claude command, and never commits or pushes. Applied setup, update,
config initialization/mutation, automatic context, and uninstall work share one token-owned local
lifecycle lock. Planned writes and deletes recheck exact content under that lock; a human change
observed before comparison is preserved and reported. CCR cooperating writers are serialized, but a
direct editor can still win the narrow interval after comparison, so do not manually edit a managed
target while a write operation runs. Multi-file operations are idempotent, so an interrupted partial
operation can be rerun safely. Uninstall also holds a global journal-mutation barrier while it
rechecks local state, so a newly created journal cannot be left behind after its ignore rules are
removed.

Useful commands:

```bash
npx --no-install ccr context status
npx --no-install ccr context validate
npx --no-install ccr context journal
npx --no-install ccr context journals
npx --no-install ccr hooks status
npx --no-install ccr config set hooks.enabled false
npx --no-install ccr config set instructions.updateDecisionsMd true
npx --no-install ccr context append-decision "Keep reviews advisory."
npx --no-install ccr setup
npx --no-install ccr update
npx --no-install ccr uninstall
```

`ccr context journals` returns the configured number of repository-wide recent journals except the
active entry, which reviews and context updates read separately. `PR-<number>` names the active PR
entry to leave out; it never limits results to that PR.

The Git hooks are optional and advisory. `.ccr/config.json` is the control plane. When
`hooks.enabled` is true (the default), `/ccr-context initialize` runs `/ccr-hooks sync`. The skill
inspects `core.hooksPath`, existing hook runners, repository hook frameworks, manifests, and current
hook semantics before choosing the least invasive repository-native integration. When the setting
is false, setup removes legacy CCR-managed blocks and the skill does not install hooks.
For composed native hooks, local provenance records the original byte length/hash and any managed
separator bytes so removal can verify exact restoration. While that provenance state exists,
`/ccr-hooks status|remove` is the lifecycle authority; CLI uninstall stops and asks you to run
`/ccr-hooks remove` first. The CLI directly inspects or removes only legacy native marker blocks.
`hooks.checkBeforeCommit` controls the advisory pre-commit warning. The pre-commit hook warns
when repository files are staged without a staged shared `.ccr/` file and when staged review evidence
or shared context differs
from the latest recorded review. Missing or invalid hook configuration fails visibly instead of
silently disabling checks. The post-commit hook starts a local journal entry, marks a mismatched
recorded review stale, and keeps an incomplete entry retryable until it is completed. It prints
`/ccr-context update last commit` to paste into Claude Code; the installed skill reads shared context
and recent journals, completes that same commit entry, and updates only durable context. Hooks remain
advisory by default.
With `hooks.autoUpdateContext: true`, the post-commit hook announces the update and waits for it; the
commit is already saved. CCR first builds a privacy-filtered packet from at most 200
approved paths and 200,000 retained characters (with a 512,000-byte final ceiling) from the exact
immutable `HEAD` commit under ignored `.ccr/private/`. Each file carries its content and its diff
against the parent, so the worker can tell new behavior from existing behavior; CCR sets the
journal's `Updated` time after validation. Headless Claude receives only `Read` and
`Edit`, can read only approved `.ccr` files and that exact packet, and can edit only the exact journal
and `.ccr/project.md`, plus append at most one normalized nonduplicate line to `.ccr/decisions.md`
when its opt-in is enabled and the approved journal already records the explicit human review
rationale. It never originates decisions from code changes. Replacement, deletion, malformed text, or a larger decision change fails
closed. It has no shell, task,
glob, grep, raw repository-read, Git-mutation, settings, hook, MCP, or session-persistence capability.
CCR attempts to
remove the temporary packet on every normal success and failure. Concurrent packet modification, an
unavailable cleanup lock, or abrupt process termination fails closed but can leave an ignored packet
for manual removal. Successful commits are recorded under bounded ignored state to prevent duplicate
runs. Automation never stages, commits, amends, resets, or pushes. CCR records completion only after
`HEAD` still matches, the exact commit journal is structurally complete, context validates, and
verification sees no unauthorized Git-visible or `.ccr` edit. The permission allowlist prevents the
headless agent from writing other ignored paths. Automatic failure stays non-blocking and prints the
manual fallback. Token-owned stale locks are reclaimed safely; resulting shared context remains
visible for review and a later commit.
Branch-local journals remain ignored and are preserved safely during uninstall.

`.ccr/config.json` is human-owned. CCR, Claude, and other AI coding agents must not change it
without approval of the exact setting and value, with one narrow first-run exception: when
`/ccr-context initialize` finds the generated `domain: "unspecified"` default, it conditionally records
one concise domain supported by repository evidence (or `general-software` if nothing more specific is
established). The conditional updater never overwrites a human-set domain; later operations never
change it automatically. Applied CLI updates serialize with setup, uninstall, and automatic context
work and use compare-and-swap writes, so concurrent keys are preserved and an active lifecycle never
receives a mid-run permission change. Shared and local configuration must each be valid, NUL-free
UTF-8 within 64,000 characters before parsing. The generated file is intentionally strict JSON, so it
contains no fake comment fields; JSON does not support `//` comments. Mandatory privacy exclusions
always apply. Optional `privacy.excludedPaths` adds repository-specific exclusions (up to 100 globs);
edit this field directly. Upgrading legacy configuration or changing unrelated settings preserves it.

The complete default file is:

```json
{
  "domain": "unspecified",
  "hooks": {
    "enabled": true,
    "checkBeforeCommit": true,
    "autoUpdateContext": false
  },
  "context": {
    "recentJournalEntries": 3,
    "maxCompactionPercent": 25
  },
  "instructions": {
    "updateClaudeMd": false,
    "updateAgentsMd": false,
    "updateDecisionsMd": true
  }
}
```

An existing `.ccr/decisions.md` is preserved and becomes the shared decision record; move useful
facts from former `.ccr/architecture.md` and `.ccr/risks.md` pages into `.ccr/project.md` before
deleting those old pages.

`decisions.md` is human-owned. CCR review always reads it as advisory context, but can append one
concise, durable decision only when `instructions.updateDecisionsMd` is `true` (the default for new
setups; files written before the setting existed stay `false` until changed) and the
human explains a lasting choice in response to a review finding, that rationale is missing from
shared context, and it would help prevent similar mistaken findings. Record the choice, reason,
scope, and important assumptions, including human-described practices absent from code. Future
reviews apply that rationale instead of repeating the same resolved finding; changed behavior or
assumptions can justify reconsideration. Code alone never establishes a human review decision.
The config-gated `ccr context append-decision <decision>` command rejects writes while the setting
is `false`; it never replaces existing entries. With the setting off, Claude keeps the rationale in
the local journal and shows the command a human can run to enable shared capture.

Runtime requirement: Node.js 22.12 or later and Claude Code 2.1.0 or later.

## Current scope

The package provides context management plus one data-driven review skill with changes, codebase,
and read-only pull-request scopes. Its review taxonomy covers Data & System Reliability,
Alignment with Teaching & Learning, Fairness & Non-Discrimination, Inclusion & Accessibility,
Transparency & Explainability, Privacy & Data Protection, and Human Control & Review. Automated fixes and the
GitHub Action remain on the roadmap. They are not claimed as available.

## Development

```bash
pnpm install
pnpm hooks:dev
pnpm verify
```

### Contributor architecture

CCR keeps stable feature-facing façades small and moves reusable policy into focused modules. Start
with `src/context/files.ts`, `src/context/git.ts`, `src/context/journal.ts`,
`src/context/automatic-context-update.ts`, or `src/review/review-state.ts`; those files preserve the
supported vocabulary while delegating to one-concern implementations.

- Managed path containment, token-owned locking, and compare-and-swap writes are separate adapters;
  new repository writes must compose those boundaries instead of implementing local retries.
- Configuration persistence owns reload, validation, serialization, lifecycle locking, and
  conditional replacement below the CLI layer.
- Journal and decision document models own parsing and mutation invariants; orchestration selects
  the document but does not reproduce its grammar.
- Git process bounds are below repository metadata operations, while privacy approval happens before
  broker or review evidence formatting.
- Review fingerprints are independent from journal continuity, so either policy can evolve without
  changing the public review-state imports.

Tests mirror observable boundaries where that improves discovery. Shared temporary-repository setup
lives in `tests/helpers/test-environment.ts`; tests should add only the fixture state relevant to the
behavior under review.

Repository-wide coding, testing, context, privacy, branching, and release rules are defined in
[AGENTS.md](AGENTS.md). Installation and usage are documented in
[USER_MANUAL.md](USER_MANUAL.md); the disposable-repository workflow and edge-case matrix are in
[TEST.md](TEST.md).
