# Changelog

Notable user-visible changes to CCR are recorded here.

This project follows [Semantic Versioning](https://semver.org/). Until `1.0.0`, a minor release may
contain incompatible changes when they are clearly documented.

## Unreleased

### Changed

- Legacy hook cleanup now shares the byte-preserving managed-block parser, validates both hooks
  before writing, and reports malformed, unsafe, or unavailable hook state distinctly.
- ASU provider settings and cost estimates use one strict validation boundary; non-retryable HTTP
  client errors now fail after one request.
- Mandatory privacy exclusions have one runtime source of truth instead of overlapping config
  defaults.

### Removed

- The premature GitHub Action manifest and provider-only entry point, which advertised review
  behavior that is still on the roadmap.

## 0.4.0 - 2026-08-11

### Added

- `/ccr-context` with five operations: initialize, update, verify, addition, and compact.
- A separate `/ccr` manual and privacy-filtered recent-commit verification paths.
- Human-readable config help for every setting and a bounded compaction percentage.
- A repository-aware `/ccr-hooks` skill chooses an existing hook framework, configured hook path,
  current interpreter, or minimal direct Git hook instead of setup hardcoding one strategy.
- A post-commit hook starts a branch-local journal entry, warns when a commit changed code without
  updating shared context, and prints a copy-paste prompt that drives `/ccr-context`.

### Changed

- Configuration schema v2 makes settings human-owned and reads supported v1 values without
  rewriting their file.
- Context discovery can incorporate explicitly supplied plans or specifications as future intent.
- Operation-scoped agent budgets keep focused context repairs bounded while preserving
  large-repository parallel discovery.
- Hook provenance verifies exact native-file restoration with original length/hash and managed
  separator metadata; framework probes are local and bounded.
- Context verification rejects shortened file citations and aggregate workflow summaries that omit
  trigger or role exceptions.
- Focused verifiers consume a bounded draft/evidence packet without tools, preventing a second
  repository-wide search during small repairs.
- Semantic compaction has a separate eight-minute budget instead of inheriting the shorter focused
  update budget.
- Human-supplied additions no longer turn an omitted implementation claim into an unsupported
  repository-absence claim.
- Context drafts remain in memory; operation-created temporary files are restricted to `.ccr/tmp/`
  and removed before completion.
- Setup and uninstall share exact-line, byte-preserving managed-block plans and reject stale,
  malformed, duplicate, or ambiguous ownership before writing.
- Hook status supports linked worktrees and reports external configured paths without blocking setup.
  Provenance-managed framework hooks must be removed through `/ccr-hooks`, preventing false CLI
  removal claims.
- CLI version now derives from the package version and is verified after packed installation.
- Product wording, privacy defaults, and context examples are programming-language and domain
  neutral.
- A failed affected-test process now fails the blast-radius quality gate instead of being converted
  to empty output.

### Removed

- Provider policy and configurable character-limit settings.
- The unused fixed discovery-agent setting and empty source scaffold modules.

## 0.2.0 - 2026-07-29

### Added

- One-package, opt-in component guidance.

### Changed

- Consolidated technical structure, data, integrations, and verification into `project.md`.

### Removed

- Separate architecture, decisions, and risks context pages. Technical details now live in the
  concise project context.

## 0.1.1 - 2026-07-29

- Used a unique local package version to avoid package-manager reuse of the first test artifact.
- Stopped context initialization on CLI/config schema mismatch instead of editing configuration.

## 0.1.0 - 2026-07-29

- Initial repository context CLI and Claude Code skill.
- Preview-first setup, validation, status, configuration, and safe uninstall.
- Filtered Git-index evidence broker and privacy exclusions.
- Branch-local journals and optional advisory pre-commit warning.
- Parallel discovery with an independent bounded verification pass.
- Packed-artifact installation smoke test and repository quality gates.

This local development package was not published to npm.
