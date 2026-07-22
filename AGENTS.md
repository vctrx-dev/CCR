# CCR Coding Rules

Enforced by `scripts/audit.mjs` pre-commit. Do not modify that file without approval.

## File LOC Limits

| Type | Limit |
|---|---|
| Implementation | 700 |
| Type definitions | 1000 |
| Tests | 500 |

## Naming Conventions

| Element | Convention | Example |
|---|---|---|
| Files/dirs | `kebab-case` | `file-filter.ts`, `src/github/` |
| Functions/vars | `camelCase` | `getDiff()`, `changedFiles` |
| Classes/interfaces/types | `PascalCase` | `ReviewConfig`, `ReviewEngine` |
| Constants (primitives) | `UPPER_CASE` | `MAX_FILE_SIZE` |
| Booleans | `is`/`has`/`should` prefix | `isValid` |
| Generics | single uppercase or PascalCase | `T`, `TData` |

No `I` prefix on interfaces. No `any`. Use `unknown` + narrow.

## Type Safety

- **`any` banned** — use `unknown` with type guards
- **`as Type` banned** — prefer Zod parsing, narrowing, discriminated unions. Exception: `as const`
- **Derive from values** — `as const` + `typeof` + `[number]`
- **Zod** for all external input validation
- **Exhaustive checks** — `never` in default branches

## Function Documentation

Every function needs JSDoc: what it does, why it exists, `@param`, `@returns`. Not needed on getters, overrides, or test blocks.

```typescript
/**
 * Parses unified diff into structured hunks.
 * Handles empty files, binary diffs, merge conflicts.
 *
 * @param diff - Raw unified diff string from `git diff`.
 * @returns Array of parsed hunks, or empty if unparseable.
 */
```

## Testing & TDD

TDD: write failing test first. Every exported function, public method, and non-trivial helper must have at least one test. Three levels enforced by the blast radius analyzer (`npm run test:changed`):

| Level | Dir | Scope |
|---|---|---|
| Small (unit) | `tests/unit/` | One function, isolated |
| Medium (integration) | `tests/integration/` | Combined functions, cross-module |
| Large (e2e) | `tests/e2e/` | Full workflows (CLI, GH Action) |

Test dir tree mirrors source tree. Test names: `it("should ...")`. Coverage thresholds guard against regression — set low enough to not block dev, high enough to catch completely untested modules.

**Blast radius** — `scripts/audit.mjs --blast` maps changed files to affected tests: unit (1:1), integration (module-level), e2e (all).

## UI Components (Future)

- Own file per component, named export, `displayName` set
- Props interface: `ComponentNameProps`, exported
- Composition (compound components, children) over giant props
- Controlled + uncontrolled via `value`/`onChange` + `defaultValue`
- Headless pattern: separate hooks/behavior from rendering

## Backend Structure

- One file = one concern. Pure functions over classes
- Typed errors at boundaries (CLI, GH Action, API handlers)
- Async/await over `.then()` chains. No singletons with hidden state
- Centralize config — no `process.env` scattered

## Project Practices

- Conventional commits: `feat:`, `fix:`, `chore:`, `test:`, `refactor:`, `docs:`, `perf:`
  - ✅ `feat: add code quality audit rules and scripts`
  - ❌ `Added Rules and scripts` (commitlint will reject this)
  - If commitlint blocks you, run: `git commit -m "type: message"` where type is one of the list above.
- Feature branches off `dev`, squash-merge to `main`
  - `dev` → feature work, PRs target `dev`
  - `stage` → pre-production validation
  - `main` → stable, protected by CI
- Lint: Biome recommended. Format: 2-space, double quotes, semicolons, line width 100
- Comments only for non-obvious WHY

## Debug Artifacts

No `console.log()` in source (use the `log` module). No `debugger`. No commented-out code. No `TODO`/`FIXME`/`HACK` without issue reference (`TODO(#123)`).

## Commands

| Command | Purpose |
|---|---|
| `npm run build` | tsup — 3 targets |
| `npm test` | Full vitest suite |
| `npm run test:unit` / `test:integration` / `test:e2e` | Run specific level |
| `npm run test:changed` | Blast radius: affected tests only |
| `npm run test:coverage` | Coverage with thresholds |
| `npm run typecheck` | tsc --noEmit |
| `npm run lint` | biome check src/ |
| `npm run audit` | Code quality audit |

## Self-Review Checklist

1. `npm run audit && npm run typecheck && npm run lint && npm test && npm run build` — all pass
2. `npm run test:changed:print` — confirm no unexpected test impacts
3. No debug artifacts, no TODOs, no commented code
4. Edge cases tested (empty input, error paths, boundaries)

## Architecture

Runtime: Node >=24, ESM. Modules under `src/`: `core/`, `log/`, `git/`, `github/`, `llm/`, `prompt/`, `patch/`, `cli/`, `action/`. Zod for validation, picomatch for globbing, ASU AIML API for LLM.
