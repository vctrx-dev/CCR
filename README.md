# CCR — Critical Code Reviewer

CCR maintains shared product context and runs stakeholder-impact reviews in Claude Code. Reviews
look for evidence-backed exclusion, unfair treatment, and harmful product assumptions—not ordinary
engineering defects relabeled as ethical issues. Results are advisory; source changes need approval.

Requires Node.js 22.12+ and Claude Code 2.1.0+. The GitHub Action remains on the roadmap; automated
fixes and the Action are not claimed as available.

## Quick start

Install in your repository:

```bash
npm install --save-dev @vctrx/ccr
# or: pnpm add --save-dev @vctrx/ccr
npx --no-install ccr config init
npx --no-install ccr setup
```

Then open Claude Code:

```text
/ccr-context initialize
/ccr-review changes
```

For global use, install with `npm install --global @vctrx/ccr` and replace `npx --no-install ccr`
with `ccr`. Installation alone creates no repository context or hooks.

Setup applies managed changes and preserves existing context. Use `--dry-run` or `--json` for a
non-mutating preview. After a package upgrade, run `npx --no-install ccr update`; it refreshes managed
skills, resources, instruction blocks, and untouched taxonomy defaults while preserving custom files.

Use `npx --no-install ccr help`, `ccr help <command>`, or `ccr <group> --help` for terminal syntax.
`ccr -v`, `ccr -version`, and `ccr --version` print the installed version.

## Claude Code skills

| Skill | Purpose |
|---|---|
| `/ccr [question]` | Explain installed commands, settings, and safety boundaries |
| `/ccr-context initialize` | Clarify project facts, populate context, and sync enabled hooks |
| `/ccr-context update` | Complete the journal; update only durable product context |
| `/ccr-context verify` | Check context against current evidence |
| `/ccr-context addition` | Incorporate supplied knowledge or labeled plans |
| `/ccr-context compact` | Compact project context by at most the configured 20–30% |
| `/ccr-hooks <sync\|status\|remove>` | Manage repository-native hook integration |
| `/ccr-review [scope] [all\|dimension,...]` | Review changes, codebase, or `PR-<number>` |

Run slash skills inside Claude Code, not a terminal. Unique minor misspellings of skill arguments
are tolerated; ambiguous input stops for clarification. PR numbers, paths, settings, flags, terminal
commands, and free-form text are never fuzzy-corrected.

## Reviews and editable dimensions

```text
/ccr-review
/ccr-review codebase
/ccr-review PR-123 privacy-data-protection, transparency-explainability
```

Blank arguments mean `changes` and all dimensions. A dimension selector without a scope also means
`changes`. Changes reviews include approved staged, unstaged, and untracked work; codebase reviews
use the safe Git index plus live changes. PR reviews require authenticated `gh` and immutable remote
evidence; they do not check out branches or substitute the local working tree.

Packaged dimension IDs:

- `data-system-reliability`
- `alignment-with-teaching-learning`
- `fairness-non-discrimination`
- `inclusion-accessibility`
- `transparency-explainability`
- `privacy-data-protection`
- `human-control-review`

The baseline follows `CCR_v5_7_review.xlsx`: seven dimensions and 28 criteria. Indicators are
non-exhaustive guidance, not empirically validated guarantees of complete coverage.

Setup installs editable `.ccr/dimensions.json`. Each review loads it through
`ccr context dimensions`; edits change the next review's dimension-and-criteria section without
rebuilding or changing surrounding instructions or report format. `--json` returns the effective
registry. Help and the generated Markdown reference show packaged defaults, not local customization.

Leave optional `_ccr` ownership metadata unchanged while editing the `dimensions` array. Update
refreshes untouched defaults but preserves customized or human-authored JSON. To restore defaults,
back up the custom file, remove only `.ccr/dimensions.json`, and run setup. Only a missing file falls
back to defaults; invalid, non-UTF-8, symlinked, or oversized input fails closed. Empty taxonomy stops
reviews. The limit is 256,000 characters. Commit this file; never include private records or secrets.

One agent investigates every selected criterion, checks counterevidence and equivalent routes, and
merges duplicates. Findings identify affected people, the product rule, a plausible consequence,
and evidence. Accessibility, privacy, wording, or reliability defects qualify only with a supported
human-impact pathway. Material uncertainty stays unconfirmed; an empty result does not prove safety.

Reports begin with `Context applied`, then numbered finding headings starting at 1, separated by
horizontal rules. Each includes severity, dimension/criterion names, `Scenario`, and `Evidence`.
Supported ethical issues outside the taxonomy use `Other — outside current dimensions` in the same
list. No trailing questions or observations; uncertain candidates stay unconfirmed in the journal.
Claude links matching names to sections in `.claude/skills/ccr/references/dimensions.md`, generated
from packaged JSON and also shipped at `dist/review/dimensions.md`. Custom names absent from that
reference remain unlinked. No file inventory, coverage report, or unsolicited fixes. See
[review guidance](USER_MANUAL.md#stakeholder-impact-review).

## Context, privacy, and hooks

Shared context is committed; local continuity stays ignored:

| Shared | Local |
|---|---|
| `.ccr/config.json`, `.ccr/dimensions.json` | `.ccr/config.local.json` |
| `.ccr/project.md`, `.ccr/stakeholders.md`, `.ccr/decisions.md` | `.ccr/journal/`, `.ccr/private/`, `.ccr/cache/`, `.ccr/tmp/` |

Initialization asks material clarification questions and writes plain-language context. Afterward,
CCR updates project context only for durable facts or confirmed plans; stakeholders remain
human-owned. Decisions are append-only under `instructions.updateDecisionsMd` (`true` for new setups,
`false` when absent from older files). Capture reusable human rationale, not policies inferred from
code. Configuration changes require approval, except the one-time untouched default-domain inference.

Each work state, commit, or PR reuses its local journal. Follow-up explanations, feedback, approved
fixes, and checks amend that account without claiming a fresh review. `Started` stays fixed;
`Updated` advances; filenames remain stable. Recent history is repository-wide, excluding the active
entry, which is always read separately. Review freshness tracks approved code and shared review
context, including taxonomy; journals and operational settings do not make it stale. A separate
input-context fingerprint checks all inputs supplied during the review.

Mandatory privacy exclusions always apply. Optional `privacy.excludedPaths` adds up to 100 globs;
legacy upgrades preserve them. Evidence uses bounded reads and literal filenames. Source and tests
outrank generated context. Never put secrets, credentials, personal records, or private discussions
in shared files. Review generated context before relying on it.

With `hooks.enabled: true`, initialization invokes `/ccr-hooks sync`. Hooks are advisory; automatic
post-commit updates require the separate default-off `hooks.autoUpdateContext` setting. Automation
uses a bounded, privacy-approved exact-HEAD packet and restricted `Read`/`Edit` permissions. It may
change only the matching journal, project context, and one authorized decision append. It never
stages, commits, resets, or pushes. Failure prints a manual fallback; interrupted cleanup may leave
an ignored packet. See the [manual](USER_MANUAL.md#hooks) for permissions and limits.

Managed lifecycle commands preserve changed-after-preview content and serialize cooperating writers.
Avoid direct edits during apply; rerun interrupted idempotent operations. Remove provenance-managed
hooks with `/ccr-hooks remove` before CLI uninstall. `ccr uninstall` preserves shared and local context;
`--remove-context` removes shared files only.

## Programmatic API

Import supported entry points: `@vctrx/ccr`, `@vctrx/ccr/context`, `@vctrx/ccr/review`, and
`@vctrx/ccr/llm`. The root supports ESM and CommonJS; focused subpaths are ESM-only. Imports alone
neither mutate repositories nor contact providers. Explicit operations retain their safety boundaries.

```ts
import { DEFAULT_CONTEXT_CONFIG, resolveContextConfig } from "@vctrx/ccr";

const config = resolveContextConfig(DEFAULT_CONTEXT_CONFIG, {
  privacy: { excludedPaths: ["internal/**"] },
});
```

Use `readReviewDimensionRegistry(root)` and `renderReviewDimensionSections(registry)` from the review
entry point for live taxonomy rendering. Default JSON is exported as `@vctrx/ccr/dimensions.json`
and ships at `dist/review/dimensions.json`. Internal source paths are not public contracts.

## Development

```bash
pnpm install
pnpm hooks:dev
pnpm verify
pnpm test:changed:print
```

`pnpm verify` runs tracked-file safety, audit, typecheck, lint, coverage tests, build, and package smoke.
Typecheck rejects unused source locals and parameters; exported helpers still require caller and
public-API checks. Test-only safety helpers are not automatically dead code.

Reuse the boundaries in [AGENTS.md](AGENTS.md); do not duplicate path, privacy, Git, config, provider,
or managed-file policy. Feature branches start from and target `dev`; releases proceed through
`stage` to `main`. See [VERSIONING.md](VERSIONING.md).

To test a packed build, run `npm pack` after verification and install the resulting tarball in a
disposable target. For a no-install prompt preview, run `pnpm test:prompt` and paste the first
dimension's output into a fresh target conversation. `dimension-prompts.md` is the standalone
read-only all-dimension prompt. Generation calls no model.

- [USER_MANUAL.md](USER_MANUAL.md): settings, ownership, evidence commands, and troubleshooting
- [TEST.md](TEST.md): automated gates and disposable-repository checks
- [CHANGELOG.md](CHANGELOG.md): changes and migrations
