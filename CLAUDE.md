# CCR — Claude-Specific Instructions

This project follows TDD, conventional commits, and strict quality gates. See [AGENTS.md](./AGENTS.md) for the full agentic worker guide covering architecture, build commands, and development principles.

## Key Points

- **Do not install Prettier** — Biome handles all formatting
- **Do not add dependencies** without explicit request — current deps are sufficient
- **No emoji in commit messages or code**
- **No JSX** — not a frontend project
- **Tests must pass** before committing (including coverage thresholds)
- **Run `npm run typecheck` before any `git commit`**
- **Run `git status` before any destructive git command**
- **Prefer Edit over Write** for existing files; Write for new files only
