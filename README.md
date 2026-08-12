# CCR — Critical Code Reviewer

CCR is research-backed tooling for maintaining concise, human-correctable context used by code
review workflows. The first package targets Claude Code while keeping its repository
context as plain Markdown and JSON.

The complete product combines:

- compact repository context management;
- research-backed Claude Code reviewer skills;
- branch-local continuity;
- an advisory GitHub Action using the same review contracts.

The staged roadmap reaches `v1.0.0` when the researched review-dimension set and advisory GitHub
Action ship on top of the current context and review-skill foundations.

## One package, optional components

CCR uses one package: `@vctrx/ccr`. Installing it makes every available CCR command accessible, but
the developer chooses which components to enable:

| Component | Enable it | Optional? |
|---|---|---|
| Editable settings and configuration manual | `ccr config init --apply` | Yes |
| Claude manual, context skill, and shared context | `ccr setup --apply` | Yes |
| Change and whole-codebase review skills | `ccr setup --apply`, then `/ccr-review` or `/ccr-codebase` | Yes |
| Advisory context hooks (pre-commit + post-commit) | `hooks.enabled: true` (default) plus `/ccr-context initialize` or `/ccr-hooks sync` | Yes |
| `CLAUDE.md` or `AGENTS.md` pointer | Enable its config setting before setup | Yes |
| Local continuity journal | Created by `/ccr-context` operations when needed | Yes |

Setup previews changes unless `--apply` is supplied. Components can be removed independently with
the matching uninstall command. The GitHub Action remains a later opt-in component.

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

The global install provides the CLI only. It does not modify a repository until you run the commands
from that repository. Neither installation creates the shared `.ccr` context files or Git hooks by
itself.

CCR is not published yet. To test a packed build from this repository:

```bash
pnpm verify
npm pack
npm install --save-dev /path/to/vctrx-ccr-0.4.0.tgz
# or globally: npm install --global /path/to/vctrx-ccr-0.4.0.tgz
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

Then open Claude Code:

| Command | Purpose |
|---|---|
| `/ccr` | Explain the installed package, safety boundaries, commands, and roadmap |
| `/ccr-hooks sync` | Choose and apply the repository's native hook integration |
| `/ccr-hooks status` | Explain the active hook strategy and CCR checks |
| `/ccr-hooks remove` | Remove only CCR-managed hook integration |
| `/ccr-context initialize` | Ask for optional outside context, discover with subagents, then verify |
| `/ccr-context update` | Update context from the staged diff |
| `/ccr-context verify` | Check all context against the current index and latest five local commits |
| `/ccr-context addition` | Add human-provided plans, specifications, or other context |
| `/ccr-context compact` | Remove at most the configured 20–30% while preserving key knowledge |
| `/ccr-review [all\|dimension,...]` | Review staged, unstaged, and untracked changes without fixing them |
| `/ccr-codebase [all\|dimension,...]` | Review the complete codebase and live changes without fixing them |

Both review skills load their taxonomy from the validated data-only
`src/review/dimensions.json` registry. Blank arguments default to all dimensions; comma-separated IDs
select a subset. The registry is intentionally empty in this development revision because the nine
research definitions were not supplied. A review stops and reports that condition instead of
inventing criteria. Adding, deleting, reordering, or revising dimensions changes only that JSON file.

Reviews always use adaptive subagents. They cluster related dimensions and evidence traces instead
of always creating one agent per dimension, then verify and deduplicate the merged findings. Output
contains severity, file, issue, triggering case, and dimension; source code is never changed without
later approval. The privacy broker exposes staged, unstaged, and untracked evidence without exposing
excluded paths.

Initialization maps independent end-to-end evidence traces, then uses an adaptive parallel discovery
wave: one agent for a small cohesive repository and more agents for multi-language, multi-surface, or
very large repositories, up to the harness's useful concurrency. A separate subagent verifies the
synthesis before one bounded correction pass. `project.md` is one connected, evidence-backed
narrative rather than fixed technical categories. Focused later operations use no discovery agent
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
`.ccr/index.md`, `.ccr/project.md`, and `.ccr/stakeholders.md` as shared context. The initial
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
npx --no-install ccr setup --apply
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
local journal entry and prints a copy-paste prompt that updates the shared context and completes the
journal in Claude Code. Hooks never invoke Claude automatically, commit, push, or edit shared context
without the reviewed context operation. Branch-local journals remain ignored and are preserved safely
during uninstall.

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
    "updateAgentsMd": false
  }
}
```

When upgrading from `0.1.x`, remove `.ccr/architecture.md`, `.ccr/decisions.md`, and
`.ccr/risks.md`, plus their routes in `.ccr/index.md`. Setup does not delete existing context
automatically because those files may contain developer-authored information; move any still-useful
technical facts into `.ccr/project.md` first.

Runtime requirement: Node.js 22.12 or later and Claude Code 2.1.0 or later.

## Current scope

The package provides context management plus data-driven change and codebase review skills. The
review workflow is installed and tested, but its research taxonomy is intentionally empty until the
dimension definitions are added. Automated fixes, human-feedback flows, and the GitHub Action remain
on the roadmap and are not claimed as available.

## Development

```bash
pnpm install
pnpm hooks:dev
pnpm verify
```

Repository-wide coding, testing, context, privacy, branching, and release rules are defined in
[AGENTS.md](AGENTS.md). Installation and usage are documented in
[USER_MANUAL.md](USER_MANUAL.md).
