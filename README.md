# CCR — Critical Code Reviewer

CCR is research-backed tooling for maintaining concise, human-correctable context used by ethical
reviews of educational software. The first package targets Claude Code while keeping its repository
context as plain Markdown and JSON.

The planned complete product combines:

- compact repository context management;
- research-backed Claude Code reviewer skills;
- branch-local continuity;
- an advisory GitHub Action using the same review contracts.

The staged roadmap reaches `v1.0.0` when context management, reviewer skills, and the advisory
GitHub Action ship together.

## One package, optional components

CCR uses one package: `@vctrx/ccr`. Installing it makes every available CCR command accessible, but
the developer chooses which components to enable:

| Component | Enable it | Optional? |
|---|---|---|
| Editable settings and configuration manual | `ccr config init --apply` | Yes |
| Claude manual, context skill, and shared context | `ccr setup --apply` | Yes |
| Advisory context hooks (pre-commit + post-commit) | `hooks.enabled: true` (default) plus `ccr setup --apply` | Yes |
| `CLAUDE.md` or `AGENTS.md` pointer | Enable its config setting before setup | Yes |
| Local continuity journal | Created by `/ccr-context` operations when needed | Yes |

Setup previews changes unless `--apply` is supplied. Components can be removed independently with
the matching uninstall command. Reviewer skills and the GitHub Action will join this same package in
later versions and remain opt-in; they are not available yet.

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

Hooks are controlled by the generated `.ccr/config.json`; setup applies the default
`hooks.enabled: true` policy after you review and apply the configuration.

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
npm install --save-dev /path/to/vctrx-ccr-0.3.0.tgz
# or globally: npm install --global /path/to/vctrx-ccr-0.3.0.tgz
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
| `/ccr-context initialize` | Ask for optional outside context, discover with subagents, then verify |
| `/ccr-context update` | Update context from the staged diff |
| `/ccr-context verify` | Check all context against the current index and latest five local commits |
| `/ccr-context addition` | Add human-provided plans, specifications, or other context |
| `/ccr-context compact` | Remove at most the configured 20–30% while preserving key knowledge |

Initialization uses focused discovery subagents that follow end-to-end evidence traces through real
workflows and constraints. A separate subagent verifies the synthesis before one bounded correction
pass. `project.md` is written as one connected, evidence-backed narrative, including small details
that can affect safe future changes rather than fixed technical categories. Every operation asks the
developer to review proposed context changes.

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

The Git hooks are optional and advisory. `.ccr/config.json` is the control plane:
`hooks.enabled: true` (the default) makes `ccr setup --apply` install or maintain the marked
pre-commit and post-commit blocks; `hooks.enabled: false` makes setup remove only those CCR-managed
blocks. `hooks.checkBeforeCommit` controls the advisory pre-commit warning. The pre-commit hook warns
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

The package provides the context-management foundation. Ethical reviewer skills, human-feedback
flows, and the GitHub Action remain on the roadmap and are not claimed as available.

## Development

```bash
pnpm install
pnpm hooks:dev
pnpm verify
```

Repository-wide coding, testing, context, privacy, branching, and release rules are defined in
[AGENTS.md](AGENTS.md). Installation and usage are documented in
[USER_MANUAL.md](USER_MANUAL.md).
