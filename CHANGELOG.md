# Changelog

Notable user-visible changes to CCR are recorded here.

This project follows [Semantic Versioning](https://semver.org/). Until `1.0.0`, a minor release may
contain incompatible changes when they are clearly documented.

## Unreleased

### Added

- Initial repository structure for the Critical Code Reviewer.
- Layered pre-commit, pre-push, and CI repository safety gates.
- Preview-first context setup, Claude Code skill installation, validation, status, and uninstall.
- Filtered Git-index repository reads and staged diffs that do not expose newer unstaged content.
- Deterministic, collision-resistant branch-local continuity journals with Git-derived metadata.
- Optional advisory pre-commit context warning with Husky-aware installation.
- Machine-readable setup preview and packed-artifact smoke verification.
- Parallel, focused Claude context discovery followed by an independent bounded verification pass.
- Self-explaining valid JSON settings through `_comment` fields and configurable discovery workers.

### Changed

- Simplified repository rules, CI, and planning material for private development.
- Prepared the public `@vctrx/ccr` CLI package with Node.js 22+ support.
- Made development-hook installation explicit so packaging never rewrites consumer Git settings.
- Refused symlink escapes, external hook paths, malformed managed blocks, and non-shell hook
  composition.

### Fixed

- Aligned CI branch coverage with the documented `dev` → `stage` → `main` flow.

### Removed

- Premature public publishing, installation, licensing, and community-facing material.
- The generated `risks.md` context page.

## 0.1.0 - Unreleased

Initial development release. Release notes will be completed when this version is ready to tag.
