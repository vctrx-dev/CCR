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
| Editable settings only | `ccr config init --apply` | Yes |
| Claude manual, context skill, and shared context | `ccr setup --apply` | Yes |
| Advisory pre-commit warning | `ccr hooks install --apply` | Yes |
| `CLAUDE.md` or `AGENTS.md` pointer | Enable its config setting before setup | Yes |
| Local continuity journal | Created by `/ccr-context` operations when needed | Yes |

Setup previews changes unless `--apply` is supplied. Components can be removed independently with
the matching uninstall command. Reviewer skills and the GitHub Action will join this same package in
later versions and remain opt-in; they are not available yet.

## Install the development package

CCR is not published yet. Test a packed build from this repository:

```bash
pnpm verify
npm pack
npm install --save-dev /path/to/vctrx-ccr-0.3.0.tgz
pnpm add --save-dev /path/to/vctrx-ccr-0.3.0.tgz
npx --no-install ccr config defaults
npx --no-install ccr config init
npx --no-install ccr config init --apply
npx --no-install ccr config set domain your-domain --apply
npx --no-install ccr config set discovery.subagentCount 3 --apply
npx --no-install ccr setup
npx --no-install ccr setup --json
npx --no-install ccr setup --apply
```

For an existing CCR installation, `ccr setup --apply` preserves `config.json`. Run
`ccr config init` to preview an explicit schema upgrade, then add `--apply` if the new commented
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

Initialization uses focused discovery subagents for product, stakeholder, technical, data,
integration, contract, and verification evidence. A separate subagent verifies the synthesis before
one bounded correction pass. Every operation asks the developer to review proposed context changes.

Setup creates only `index.md`, `project.md`, and `stakeholders.md` as shared context. It preserves
existing context and instructions, executes no repository-resolved Claude command, and never commits
or pushes.

Useful commands:

```bash
npx --no-install ccr context status
npx --no-install ccr context validate
npx --no-install ccr context journal
npx --no-install ccr context journals
npx --no-install ccr hooks install
npx --no-install ccr hooks install --apply
npx --no-install ccr hooks status
npx --no-install ccr uninstall
```

The Git hook is optional and advisory. It only warns when repository files are staged without a
staged shared `.ccr/` file. Claude receives repository evidence through a Git-index broker with
mandatory credential/local-path exclusions, so staged review never reads a newer unstaged file.
Branch-local journals remain ignored and are preserved safely during uninstall.

`.ccr/config.json` is human-owned. Its top `_help` map documents every setting, datatype, allowed
range, and effect. CCR and Claude do not change it unless the developer explicitly requests or
approves the exact change. Default exclusions cover environment files, credential/secret
directories, private-key formats, and student-data directories.

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
