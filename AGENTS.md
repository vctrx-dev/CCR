# CCR Coding Rules

Enforced by `scripts/audit.mjs` pre-commit. Do not modify that file without approval.

## File Size

One file should represent one concern. Size is a signal to reconsider boundaries, not a reason to
split cohesive code mechanically.

| Type | Soft limit | Hard limit |
|---|---:|---:|
| Implementation | 300 | 500 |
| Type definitions | 500 | 700 |
| Tests | 300 | 400 |

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

Document exported APIs and behavior that is surprising, safety-sensitive, or constrained by a
non-obvious decision. Do not add JSDoc that merely restates a function name or TypeScript signature.
Internal helpers need comments only when their reason or constraints are not clear from the code.

```typescript
/**
 * Parses unified diff into structured hunks.
 * Handles empty files, binary diffs, merge conflicts.
 *
 * @param diff - Raw unified diff string from `git diff`.
 * @returns Array of parsed hunks, or empty if unparseable.
 */
```

## Reusable Code and Extension Comments

When adding a reusable boundary, document it where future developers and coding agents will first
look: at the top of its file and on its exported API. State the intended reuse, the important
constraint, and the preferred extension path—not a restatement of the implementation.

- Check existing modules before creating a helper, registry, type, parser, filesystem operation,
  Git operation, or managed-file workflow.
- Reuse an existing boundary when it fits. If a new feature needs a compatible generalization,
  evolve the shared code with regression coverage so current behavior stays intact; do not copy it
  into a feature-specific implementation.
- File-level reuse comments belong on shared registries, safety boundaries, and adapters. Exported
  reusable APIs need JSDoc that names their safety or behavior constraint.
- Do not comment obvious one-off helpers or repeat TypeScript types in prose. Comments must make the
  next implementation safer or easier to extend.

## Testing & TDD

Use TDD for behavior changes and bug fixes: write or identify a failing behavioral test, implement
the smallest change, then refactor. Documentation, formatting, generated files, and mechanical
configuration changes do not require a contrived failing test.

Test observable behavior through stable boundaries. Do not require a one-to-one test for every
helper or mirror implementation details in assertions. Add the narrowest test level that proves the
change:

| Level | Dir | Scope |
|---|---|---|
| Small (unit) | `tests/unit/` | One function, isolated |
| Medium (integration) | `tests/integration/` | Combined functions, cross-module |
| Large (e2e) | `tests/e2e/` | Full workflows (CLI, GH Action) |

Unit test paths normally mirror source paths when that improves discovery. Test names describe
behavior and conditions clearly; `it("should ...")` is preferred but not mandatory. Coverage
protects against untested modules, not against every uncovered line.

**Blast radius** — `scripts/audit.mjs --blast` maps changed files to affected tests: unit (1:1), integration (module-level), e2e (all).

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
- Feature branches start from `dev` and merge back into `dev`
  - `dev` → feature work, PRs target `dev`
  - `stage` → pre-production validation promoted from `dev`
  - `main` → stable releases promoted from `stage`
- Lint: Biome recommended. Format: 2-space, double quotes, semicolons, line width 100
- Comments only for non-obvious WHY

## Prompt Writing

Before authoring or editing any prompt shipped in this package — Claude Code skills
(`src/context/skills.ts`), the post-commit copy-paste instruction
(`src/context/after-commit.ts`), the `CLAUDE.md`/`AGENTS.md` pointer block
(`src/context/templates.ts`), or future review prompts — read and follow the official Claude
prompting best practices:

<https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices>

Key practices to apply: be clear and direct with specific output constraints; give Claude a role;
provide context and motivation for instructions; use 3-5 relevant, structured few-shot examples;
structure complex prompts with XML tags; direct tool use explicitly; and define success criteria
and when to stop. Prefer telling Claude what to do over what not to do.

## Repository Quality Gates

Biome is the formatter and linter; do not add Prettier unless the formatter is deliberately
replaced. Git hooks and CI use the same package scripts:

- Pre-commit formats and safely fixes supported staged files first.
- It then checks staged files for secrets, private key files, generated output, oversized files,
  conflict markers, and remaining whitespace errors.
- Finally, it runs the code audit, typecheck, and affected tests.
- Pre-push runs the complete `pnpm verify` gate: tracked-file safety, audit, typecheck, lint,
  coverage tests, and build.
- CI runs `pnpm verify` with a frozen lockfile and is authoritative because local hooks can be
  bypassed with `--no-verify`.
- Never weaken or skip a failing gate merely to complete a commit. Fix the cause or obtain explicit
  maintainer approval for a policy change.
- Repository quality gates may stop commits or pushes. This is separate from CCR review findings
  and future target-repository context hooks, which remain advisory.

## CCR Context Ownership

- Commit shared repository context so local agents and CI use the same project knowledge.
- Keep per-developer continuity journals local. They describe work on one branch and must not
  influence another developer's review.
- Shared context must not contain secrets, credentials, student records, personal data, or raw
  private discussions.
- Source, tests, schemas, and interfaces outrank generated context.
- Generated context is advisory and must link important claims to live paths, symbols, commands,
  decisions, or Git history.
- Never treat a developer's silence as confirmation of a finding.
- Review results are advisory by default. Distinguish confirmed issues, questions, and observations;
  uncertainty must not be presented as a proven bug.
- Default hooks may detect stale context and print a repair command. They must not invoke an LLM,
  rewrite or stage files, retry Git operations, or block a commit or push.

## Versioning and Releases

CCR uses Semantic Versioning (`MAJOR.MINOR.PATCH`):

- `PATCH` fixes defects without intentionally changing a public interface.
- `MINOR` adds backward-compatible behavior or interfaces.
- `MAJOR` makes an incompatible change. Before `1.0.0`, incompatible changes increment `MINOR`.
- The version in `package.json` is the source of truth.
- Release tags use the exact form `vMAJOR.MINOR.PATCH`, such as `v0.1.0` or `v1.0.0`.
- Do not change a version for ordinary development commits. Change it only in a release-preparation
  change.
- Every release must update `CHANGELOG.md` and move relevant entries from `Unreleased` into a
  heading for the released version and date.
- Release notes describe user-visible behavior, migration steps, known limitations, and notable
  fixes. Do not list internal refactors unless they affect users or contributors.
- A release is complete only after validation passes, the release change reaches `main`, and the
  matching immutable Git tag is created from that commit.
- Never move or reuse a published release tag. Fix a release through a new version.

## User Documentation

- Update `USER_MANUAL.md` in the same change as any user-facing skill, slash operation, CLI command,
  configuration setting, setup flow, privacy boundary, or uninstall behavior.
- Keep examples aligned with the current package version and clearly label future capabilities.

## Debug Artifacts

No `console.log()` in source (use the `log` module). No `debugger`. No commented-out code. No `TODO`/`FIXME`/`HACK` without issue reference (`TODO(#123)`).

## Commands

| Command | Purpose |
|---|---|
| `pnpm build` | tsup — 3 targets |
| `pnpm test` | Full vitest suite |
| `pnpm test:unit` / `test:integration` / `test:e2e` | Run specific level |
| `pnpm test:changed` | Blast radius: affected tests only |
| `pnpm test:coverage` | Coverage with thresholds |
| `pnpm typecheck` | tsc --noEmit |
| `pnpm lint` | biome check src/ |
| `pnpm run audit` | Code quality audit |
| `pnpm check:staged` | Check staged content for repository safety issues |
| `pnpm check:tracked` | Check all tracked content for repository safety issues |
| `pnpm verify` | Complete pre-push and CI verification |

## Self-Review Checklist

1. `pnpm verify` — complete safety, quality, test coverage, and build gate passes
2. `pnpm test:changed:print` — confirm no unexpected test impacts
3. No debug artifacts, no TODOs, no commented code
4. Edge cases tested (empty input, error paths, boundaries)

## Architecture

Runtime: Node >=24, ESM. Modules under `src/`: `core/`, `log/`, `git/`, `github/`, `llm/`, `prompt/`, `patch/`, `cli/`, `action/`. Zod for validation, picomatch for globbing, ASU AIML API for LLM.
