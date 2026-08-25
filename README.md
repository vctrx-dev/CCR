# CCR — Critical Code Reviewer

CCR is research-backed tooling for maintaining concise, human-correctable context used by code
review workflows. The first package targets Claude Code while keeping its repository
context as plain Markdown and JSON.

The complete product combines:

- compact repository context management;
- research-backed Claude Code reviewer skills;
- branch-local continuity;

The staged roadmap reaches `v1.0.0` by expanding and validating the review taxonomy, then shipping
the advisory GitHub Action on top of the current context and review-skill foundations.

## One package, optional components

CCR uses one package: `@vctrx/ccr`. Installing it makes every available CCR command accessible, but
the developer chooses which components to enable:

| Component | Enable it | Optional? |
|---|---|---|
| Editable settings and configuration manual | `ccr config init --apply` | Yes |
| Claude manual, context skill, and shared context | `ccr setup --apply` | Yes |
| Unified review skill | `ccr setup --apply`, then `/ccr-review` | Yes |
| Advisory context hooks (pre-commit + post-commit) | `hooks.enabled: true` (default) plus `/ccr-context initialize` or `/ccr-hooks sync` | Yes |
| `CLAUDE.md` or `AGENTS.md` pointer | Enable its config setting before setup | Yes |
| Local continuity journal | Created by `/ccr-context` operations when needed | Yes |

Setup previews changes unless `--apply` is supplied. Components can be removed independently with
the matching uninstall command. The GitHub Action remains a later opt-in component.

An uncommitted working journal is titled `CCR Journal` and contains no Branch, Commit, or changed-path
metadata. The post-commit hook attaches Branch and Commit only after Git creates the commit, reusing
the working entry instead of creating a duplicate. Each pull request has one separate local journal
entry that repeated reviews and human follow-up reuse. Each completed review replaces the initial
summary placeholder with a concise factual scope, evidence, and outcome record.

## Install in a project or globally

Choose a project-local install when CCR belongs to the repository and should be available through its
package scripts. Choose a global install when you want the `ccr` CLI available across repositories.

### Project-local install

```bash
npm install --save-dev @vctrx/ccr
# or: pnpm add --save-dev @vctrx/ccr

npx --no-install ccr config init --apply
npx --no-install ccr setup --apply
```

Run `npx --no-install ccr help` to see all terminal commands, Claude Code skills, review syntax, and
currently configured dimension IDs. Use `npx --no-install ccr help <command>` or
`npx --no-install ccr <group> --help` for command-specific arguments. A bare `ccr` command requires
a global installation; project-local installs use the `npx --no-install` prefix.

Hooks are controlled by the generated `.ccr/config.json`. Setup installs the repository-aware
`/ccr-hooks` skill; `/ccr-context initialize` invokes it when `hooks.enabled` is true.

### Global CLI install

```bash
npm install --global @vctrx/ccr
# or: pnpm add --global @vctrx/ccr

cd /path/to/your/repository
ccr config init --apply
ccr setup --apply
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

CCR is not published yet. To test a packed build from this repository:

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
npx --no-install ccr config init
npx --no-install ccr setup
npx --no-install ccr setup --json
```

For an existing CCR installation, `ccr setup --apply` preserves `config.json`. Run
`ccr config init` to preview a minimal configuration upgrade, then add `--apply` if the proposed
settings are correct.

After updating `@vctrx/ccr`, run `npx --no-install ccr update --apply`. It refreshes only
package-managed CCR skills, resources, and marked instruction blocks; configuration, shared context,
journals, private state, and user-owned files remain unchanged.

Then open Claude Code:

| Command | Purpose |
|---|---|
| `/ccr [question]` | Answer doubts about installed commands, arguments, skills, dimensions, and safety boundaries |
| `/ccr-hooks sync` | Choose and apply the repository's native hook integration |
| `/ccr-hooks status` | Explain the active hook strategy and CCR checks |
| `/ccr-hooks remove` | Remove only CCR-managed hook integration |
| `/ccr-context initialize` | Populate project and stakeholder context, then verify |
| `/ccr-context update` | Complete the current journal and update only durable context |
| `/ccr-context verify` | Check all context against the current index and latest five local commits |
| `/ccr-context addition` | Add human-provided plans, specifications, or other context |
| `/ccr-context compact` | Compact only project context by at most the configured 20–30% |
| `/ccr-review [scope] [all\|dimension,...]` | Review changes, the complete codebase, or `PR-<number>` without fixing them |

The review skill loads its taxonomy from the validated data-only
`src/review/dimensions.json` registry. Current review dimensions: `fairness-evaluation`, `pedagogy`,
`decision-fairness`, `inclusion`, `transparency`, `privacy`.
Blank arguments default to a changes review across all dimensions. Use `/ccr-review changes` for
clarity, `/ccr-review codebase` for the complete codebase, or `/ccr-review PR-123` for pull request
123. Put `all` or comma-separated dimension IDs after the scope, such as
`/ccr-review codebase privacy, transparency`. A selector without a scope remains a changes review
for backward compatibility. `npx --no-install ccr help` prints the IDs bundled in the installed
version. An empty registry stops a review and reports that condition instead of inventing criteria.
To add, delete, reorder, or revise dimensions, change the registry first; also update matching README
and user-manual references, then run package smoke to verify the shipped help and documentation
remain aligned.

Reviews fan out exactly one subagent per selected dimension. Each worker receives the complete criteria
for its dimension and reports criterion coverage plus evidence-backed findings. The master agent then
collects, deduplicates, verifies, and reports only validated findings.
contains severity, file, issue, triggering case, and dimension; source code is never changed without
later approval. The privacy broker exposes staged, unstaged, and untracked evidence without exposing
excluded paths.
Before any worker is dispatched, every review reads bounded `project.md`, `stakeholders.md`, and
`decisions.md` plus every journal returned within `context.recentJournalEntries`. Changes and
codebase scopes use the current branch journals; PR scope uses that PR's isolated journal history.
PR evidence is bounded to 64 KiB of metadata, 200 changed paths, a 512 KiB patch, 128 KiB per head
file, and 2 MiB total. CCR's `context review-pr` and `context review-pr-head` boundaries enforce
those limits and configured privacy exclusions before evidence reaches review workers. An excluded
path or oversized response stops the PR review instead of continuing with incomplete evidence.

Initialization maps independent end-to-end evidence traces, then uses an adaptive parallel discovery
wave: one agent for a small cohesive repository and more agents for multi-language, multi-surface, or
very large repositories, up to the harness's useful concurrency. A separate subagent verifies the
synthesis before one bounded correction pass. `project.md` is one connected, evidence-backed
narrative rather than fixed technical categories. Initialization also populates `stakeholders.md`;
after that, CCR treats stakeholder context as human-owned and read-only. Focused later operations use no discovery agent
for one evidence trace and normally use one parallel wave only when traces are independent. Agent,
read, and time budgets are starting guidance rather than hard ceilings: Claude chooses the smallest
sufficient evidence plan and expands it only for a named unsupported, contradictory, truncated, or
new consequential trace. It stops when every material claim is evidenced or explicitly unknown.
Every operation's verifier receives the bounded draft/evidence packet and performs no repository
search. Every operation asks the developer to review it.

`ccr config init` is preview-only. Add `--apply` only after reviewing the proposed files; the flag
is the explicit write confirmation. After it succeeds, `.ccr/config-manual.md` explains every key
in the same order as `.ccr/config.json`. Edit `.ccr/config.json` directly or use
`ccr config set <key> <value> --apply`, validate it, and then run setup. `ccr config init --apply`
creates `.ccr/config.json` and `.ccr/config-manual.md`. `ccr setup --apply` then creates
`.ccr/project.md`, `.ccr/stakeholders.md`, and an empty `.ccr/decisions.md` as shared context. The initial
`/ccr-context initialize` prompt fills the context from repository evidence; it is not the command
that creates the `.ccr` folder structure. Setup preserves existing context and instructions, executes
no repository-resolved Claude command, and never commits or pushes.

Useful commands:

```bash
npx --no-install ccr context status
npx --no-install ccr context validate
npx --no-install ccr context journal
npx --no-install ccr context journals
npx --no-install ccr hooks status
npx --no-install ccr config set hooks.enabled false --apply
npx --no-install ccr config set instructions.updateDecisionsMd true --apply
npx --no-install ccr context append-decision "Keep reviews advisory."
npx --no-install ccr setup --apply
npx --no-install ccr update --apply
npx --no-install ccr uninstall
```

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
when repository files are staged without a staged shared `.ccr/` file. The post-commit hook starts a
local journal entry and prints a copy-paste prompt that preloads shared context and configured recent
journals, completes that same commit entry, and updates only durable context in Claude Code. Hooks
never invoke Claude automatically, commit, push, or edit shared context without the reviewed context
operation. Branch-local journals remain ignored and are preserved safely during uninstall.

`.ccr/config.json` is human-owned. CCR, Claude, and other AI coding agents must not change it
without approval of the exact setting and value. The generated file is intentionally strict JSON, so
it contains no fake comment fields; JSON does not support `//` comments. Runtime privacy exclusions
remain mandatory defaults and are not user-editable settings.

The complete default file is:

```json
{
  "domain": "unspecified",
  "hooks": {
    "enabled": true,
    "checkBeforeCommit": true
  },
  "context": {
    "recentJournalEntries": 3,
    "maxCompactionPercent": 25
  },
  "instructions": {
    "updateClaudeMd": false,
    "updateAgentsMd": false,
    "updateDecisionsMd": false
  }
}
```

When upgrading from an older CCR version, setup removes the obsolete `.ccr/index.md` only when it
still exactly matches CCR's generated template. A human-edited index is preserved for manual review.
An existing `.ccr/decisions.md` is preserved and becomes the shared decision record; move useful
facts from former `.ccr/architecture.md` and `.ccr/risks.md` pages into `.ccr/project.md` before
deleting those old pages.

`decisions.md` is human-owned. CCR review always reads it as advisory context, but can append one
concise, durable decision only when `instructions.updateDecisionsMd` is explicitly `true` and the
human confirms the future review rule or repository evidence directly records that decision.
The config-gated `ccr context append-decision <decision>` command rejects writes while the default
is `false`; it never replaces existing entries.

Runtime requirement: Node.js 22.12 or later and Claude Code 2.1.0 or later.

## Current scope

The package provides context management plus one data-driven review skill with changes, codebase,
and read-only pull-request scopes. Its review taxonomy covers fairness evaluation, pedagogy, decision
fairness, inclusion, transparency, and privacy. Automated fixes and the
GitHub Action remain on the roadmap. They are not claimed as available.

## Development

```bash
pnpm install
pnpm hooks:dev
pnpm verify
```

Repository-wide coding, testing, context, privacy, branching, and release rules are defined in
[AGENTS.md](AGENTS.md). Installation and usage are documented in
[USER_MANUAL.md](USER_MANUAL.md).
