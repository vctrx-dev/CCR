# CCR — Agentic Worker Guide

CCR (Critical Code Reviewer) is a TypeScript project: an LLM-powered code review tool focused on educational AI fairness. Runs as GitHub Action, CLI, and programmatic API.

## Development Principles

- **TDD first** — write failing test, implement, verify pass, commit. Tests prove the code works.
- **Small commits, conventional messages** — `feat:`, `fix:`, `chore:`, `test:`, `refactor:`, `docs:`, `perf:`. One concern per commit.
- **YAGNI** — no features beyond what the current task requires. No speculative abstractions, no preemptive error handling for impossible states.
- **Biome, not Prettier** — lint + format via Biome 1.9.x. No Prettier config or deps.
- **No comments** unless the "why" is non-obvious. Well-named code explains itself.

## Build & Test

| Command | Purpose |
|---|---|
| `npm run build` | tsup — 3 targets (CLI CJS, Action CJS, Lib ESM) |
| `npm test` | vitest run |
| `npm run test:coverage` | vitest with v8 coverage (stmts 80, branches 70, funcs 75, lines 80) |
| `npm run typecheck` | tsc --noEmit |
| `npm run lint` | biome check src/ |
| `npm run format` | biome format --write src/ |

## Architecture

- **12 modules** under `src/`: `core/` (types, config), `log/`, `git/`, `github/`, `llm/`, `prompt/`, `patch/`, `cli/`, `action/`
- **Runtime**: Node >=24, ESM package (`"type": "module"`)
- **Validation**: Zod for all external input
- **Globbing**: picomatch for file filtering
- **LLM**: ASU AIML API (`api-main.aiml.asu.edu/queryV2`)
- **GitHub Action**: `@actions/core` + `@actions/github`

## Module Responsibilities

| Module | Responsibility |
|---|---|
| `core/` | Shared types, config schema, constants |
| `log/` | Structured logging (stdout JSON, stderr human) |
| `git/` | Git diff, blame, changed-file discovery |
| `github/` | PR metadata, comments, review submission via REST/GraphQL |
| `llm/` | LLM client abstraction — request, retry, token counting |
| `prompt/` | Prompt template loading and rendering with context |
| `patch/` | Unified diff parsing, hunks, line mapping |
| `cli/` | Commander-based CLI with subcommands |
| `action/` | GitHub Action entry point wiring `@actions/core` inputs |

## Self-Review

Before declaring a task done:
1. Typecheck passes
2. All tests pass (including coverage thresholds)
3. Lint clean
4. Build succeeds
5. Edge cases tested (empty input, error paths, boundary values)
6. No debug artifacts, no commented code, no TODOs

## Branch Conventions

- Work on feature branches off `master`
- `master` is the stable branch — direct pushes blocked by CI
- Squash-merge PRs with conventional commit messages
