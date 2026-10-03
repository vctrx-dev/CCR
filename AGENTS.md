# CCR Coding Rules

`scripts/audit.mjs` enforces these rules at pre-commit. Do not modify it without approval.

## Architecture and style

Node.js 22.12+ is the package floor; `.node-version` pins Node 24 for development. ESM modules:
`src/cli/` (terminal), `context/` (managed context/privacy), `llm/` (providers/ASU AIML), `review/`
(taxonomy/evidence), and `types/` (ambient declarations). Zod validates inputs; picomatch applies globs.

- One file, one concern. Prefer pure functions, async/await, typed boundary errors, and centralized
  configuration. No hidden-state singletons or scattered `process.env` reads.
- Biome is the formatter/linter: 2-space indent, double quotes, semicolons, width 100. Do not add
  Prettier unless deliberately replacing Biome.
- No `any`, `as Type`, or `I`-prefixed interfaces. Use `unknown`, narrowing, Zod, discriminated unions,
  and exhaustive `never` checks. `as const` is allowed; derive types from values.
- Typecheck rejects unused source locals/parameters. Before deleting exports, check runtime, test,
  tooling, and public-API callers; test-only safety helpers are not automatically dead code.
- No source `console.log()` (use the `log` module), `debugger`, or commented-out code. `TODO`/`FIXME`/`HACK`
  require an issue reference, such as `TODO(#123)`.

| Element | Naming |
|---|---|
| Files/directories | `kebab-case` |
| Functions/variables | `camelCase` |
| Classes/interfaces/types | `PascalCase` |
| Primitive constants | `UPPER_CASE` |
| Booleans | `is` / `has` / `should` prefix |
| Generics | Single uppercase letter or `PascalCase` |

Size signals cohesion; do not split cohesive code mechanically:

| File type | Soft limit | Hard limit |
|---|---:|---:|
| Implementation | 300 | 500 |
| Type definitions | 500 | 700 |
| Tests | 300 | 400 |

Document exported APIs and non-obvious safety/behavior constraints. Shared registries, adapters,
and safety boundaries need file-level reuse guidance and exported JSDoc naming intended reuse,
constraints, and the extension path. Avoid comments that repeat names/types or explain obvious helpers.

## Reusable Boundary Map

Before adding a helper, parser, provider call, Git read, or managed-file workflow, find its boundary
here. Reuse it or extend it with regression coverage; never copy policy into a feature-local helper.

| Need | Reuse first | Extension constraint |
|---|---|---|
| Repository reads/writes/deletes, symlinks, bounded content | `src/context/files.ts` | Preserve managed-path checks |
| Privacy approval and evidence | `src/context/privacy.ts`, `src/context/broker.ts`, `src/review/evidence.ts` | Preserve each source's authorization; share only post-approval formatting via `src/context/evidence-format.ts` |
| Generated files/instruction lifecycle | `src/context/managed-artifacts.ts`, `src/context/managed-block.ts` | Add registry policy, not path-specific setup/uninstall branches |
| Config parsing, migration, updates | `src/context/config.ts` | Evolve schema, defaults, migration, and updates together; no ad-hoc parsing/mutation |
| Provider contracts, retries, bounded responses | `src/llm/index.ts`, `src/llm/asu-api-transport.ts`, `src/llm/asu-api-response-body.ts` | Add a `ReviewProvider` adapter; reuse transport/response bounds |
| Taxonomy and evidence presentation | `src/review/dimensions.ts`, `src/review/evidence.ts`, `src/context/evidence-format.ts` | Keep one data-driven taxonomy and privacy-filtered formatter |
| Public API | `src/index.ts`, `src/context/index.ts`, `src/review/index.ts`, `src/llm/index.ts` | Export stable documented contracts; add package smoke for new entry points |

## Tests and safety

For behavior changes/bug fixes, write or identify a failing observable test before production edits;
implement the smallest change, then refactor. Keep the regression test. Documentation, formatting,
generated files, and mechanical config edits need no contrived failing test.

Test behavior through stable boundaries at the narrowest useful level:

| Level | Directory | Scope |
|---|---|---|
| Unit | `tests/unit/` | Isolated behavior |
| Integration | `tests/integration/` | Cross-module behavior |
| E2E | `tests/e2e/` | Full workflows |

Mirror source paths when helpful; use clear behavioral names (`it("should ...")` preferred).
Do not mirror implementation details or require one test per helper. Coverage guards modules, not
every line. Blast radius maps unit tests 1:1, integration tests by module, and all E2E tests.

- Coverage thresholds are a regression floor. Do not lower them or exclude product code to pass.
- Validate untrusted requests, provider responses, files, Git output, and environment strings.
  Bound size/count/time before retention/forwarding; test rejection and truncation.
- Errors, logs, CLI output, context, and telemetry must be safe to disclose. Never echo credentials,
  tokens, private input, or raw upstream bodies. Keep bounded redacted diagnostics and test them.
- User-facing commands, help, config, taxonomy, skills, setup, privacy, or uninstall changes require
  matching `README.md` and `USER_MANUAL.md` updates. Keep examples current and future features labeled.
  Package smoke assertions must derive from the shipped source of truth.

### Prompt/taxonomy exception

Do not test shipped prose or specific taxonomy content with unit tests, snapshots, regexes, or exact
strings. Tests may establish artifact existence/parsing, never its examples, wording, dimension or
criterion IDs, or order.

Prompt-only `src/context/skills.ts`, `src/context/manual-skill.ts`, `src/context/templates.ts`,
`src/review/skills.ts`, and the data-only taxonomy are exempt from 1:1 test discovery and blast-radius
execution when they are the only changed sources. Validate schema/JSON, lint/audit, build, package
smoke, and focused model evaluation when warranted. Executable parsers, validators, evidence,
installation, and orchestration still require behavioral tests.

## Prompt writing

Before editing any shipped prompt (skills, post-commit instruction, instruction-pointer block, or
review prompt), read and follow:

<https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices>

For Claude Code skills, also read:

<https://resources.anthropic.com/hubfs/The-Complete-Guide-to-Building-Skill-for-Claude.pdf>

Be direct: define role, context, motivation, output constraints, explicit tool use, success/stop
criteria, and 3–5 structured relevant examples. Use XML for complex instructions and prefer positive
directions. Skill frontmatter must say what and when; use concise progressive disclosure, error
handling, examples, and deterministic critical validation. Evaluate triggering/non-triggering,
functional behavior, repeated runs, and first-use clarity.

## Quality gates and workflow

- Pre-commit formats/safely fixes staged files, then checks secrets, keys, generated output, size,
  conflicts, and whitespace; finally runs audit, typecheck, and affected tests.
- Pre-push and CI run `pnpm verify`: tracked safety, audit, typecheck, lint, coverage, build, package
  smoke. CI uses a frozen lockfile and is authoritative; local hooks can be bypassed.
- Never weaken/skip a failing gate to finish a commit. Fix the cause or get explicit maintainer
  approval for a policy change. Repository quality gates may block Git; CCR findings/default target
  context hooks remain advisory.
- Use conventional commits: `feat`, `fix`, `chore`, `test`, `refactor`, `docs`, `perf`. If commitlint
  fails, correct the message (`git commit -m "type: message"`); do not bypass it.
- Feature branches start from and target `dev`; promote `dev` → `stage` → `main`.

| Command | Purpose |
|---|---|
| `pnpm build` | Build three package targets |
| `pnpm test` | Full Vitest suite |
| `pnpm test:unit` / `test:integration` / `test:e2e` | One test level |
| `pnpm test:changed` / `test:changed:print` | Run/list affected tests |
| `pnpm test:coverage` | Coverage with thresholds |
| `pnpm typecheck` | Type and unused-source checks |
| `pnpm lint` | Biome check of the repository |
| `pnpm run audit` | Code quality audit |
| `pnpm check:staged` / `check:tracked` | Repository content safety |
| `pnpm verify` | Complete gate |

Before finishing: run `pnpm verify` and `pnpm test:changed:print`; check empty/error/boundary cases
and remove debug artifacts, commented code, and unreferenced TODOs.

## Context ownership

- Commit shared repository context; keep per-developer branch journals local so they do not become
  another developer's review authority. No secrets, credentials, student/personal records, or raw
  private discussions in shared files.
- Source, tests, schemas, and interfaces outrank generated context. It is advisory and must link
  important claims to live paths, symbols, commands, decisions, or history; keep narrative plain-language.
- Never treat silence as confirmation. Separate confirmed findings, questions, and observations;
  uncertainty is not a proven bug.
- Default hooks may detect stale context and print a repair command, but never invoke an LLM,
  rewrite/stage files, retry Git, or block commits/pushes.

## Releases

`package.json` is the version source. Use SemVer: PATCH fixes without intentional public-interface
changes, MINOR adds compatible behavior, MAJOR breaks compatibility; before 1.0, incompatible changes
increment MINOR. Change versions only for release preparation.

Move relevant `Unreleased` changelog entries under the version/date, covering user effects, migration,
limits, and notable fixes—not internal refactors unless users/contributors are affected. Release is
complete only after validation, arrival on `main`, and an immutable `vMAJOR.MINOR.PATCH` tag from
that commit. Never move/reuse a published tag; fix releases with a new version.
See [VERSIONING.md](VERSIONING.md) for the checklist.
