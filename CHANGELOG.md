# Changelog

Notable user-visible changes to CCR are recorded here.

This project follows [Semantic Versioning](https://semver.org/). Until `1.0.0`, a minor release may
contain incompatible changes when they are clearly documented.

## 0.3.0 - Unreleased

### Added

- `/ccr-context` with five operations: initialize, update, verify, addition, and compact.
- A separate `/ccr` manual and privacy-filtered recent-commit verification paths.
- Human-readable config help for every setting and a bounded compaction percentage.

### Changed

- Configuration schema v2 makes settings human-owned and reads supported v1 values without
  rewriting their file.
- Context discovery can incorporate explicitly supplied plans or specifications as future intent.

### Removed

- Provider policy and configurable character-limit settings.

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
