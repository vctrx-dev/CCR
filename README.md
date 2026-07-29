# CCR — Critical Code Reviewer

CCR is a private research and development project for reviewing ethical risks in educational
software. It is not yet released or ready for installation in other repositories.

The planned complete product combines:

- compact repository context management;
- research-backed Claude Code reviewer skills;
- human-approved decisions and branch-local continuity;
- an advisory GitHub Action using the same review contracts.

See [the context and product roadmap](docs/CONTEXT-MANAGEMENT-PLAN.md) for the staged path to
`v1.0.0`.

## Current status

The repository contains early LLM-provider code and scaffolding for the future CLI, skills, context
system, reviewer, and GitHub Action. Empty modules are placeholders, not completed features.

Do not publish the package, create public installation instructions, or claim a planned capability
is available before its roadmap exit criteria are met.

## Development

```bash
pnpm install
pnpm verify
```

Repository-wide coding, testing, context, privacy, branching, and release rules are defined in
[AGENTS.md](AGENTS.md).
