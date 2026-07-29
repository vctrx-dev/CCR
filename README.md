# CCR — Critical Code Reviewer

CCR is research-backed tooling for maintaining concise, human-correctable context used by ethical
reviews of educational software. The first package targets Claude Code while keeping its repository
context as plain Markdown and JSON.

The planned complete product combines:

- compact repository context management;
- research-backed Claude Code reviewer skills;
- human-approved decisions and branch-local continuity;
- an advisory GitHub Action using the same review contracts.

The staged roadmap reaches `v1.0.0` when context management, reviewer skills, and the advisory
GitHub Action ship together.

## Install the development package

CCR is not published yet. Test a packed build from this repository:

```bash
pnpm verify
npm pack
npm install --save-dev /path/to/vctrx-ccr-0.1.0.tgz
npx --no-install ccr config defaults
npx --no-install ccr config init
npx --no-install ccr config init --apply
npx --no-install ccr config set domain your-domain --apply
npx --no-install ccr config set discovery.subagentCount 3 --apply
npx --no-install ccr setup
npx --no-install ccr setup --json
npx --no-install ccr setup --apply
```

Then open Claude Code and run `/ccr initialize`. Three focused discovery subagents inspect product,
stakeholder, architecture, data, integration, contract, and verification evidence in parallel. A
separate subagent verifies the synthesized claims before one bounded correction pass. Setup previews
changes by default, preserves existing context and instructions, executes no repository-resolved
Claude command, and never commits or pushes.

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
[AGENTS.md](AGENTS.md).
