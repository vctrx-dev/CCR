# Releases

`package.json` is the version source. Use SemVer: PATCH fixes, MINOR compatible additions, MAJOR
incompatible changes; before 1.0, incompatible changes increment MINOR. Ordinary development does
not bump versions.

1. Choose the version from `CHANGELOG.md` → `Unreleased`; update package/lockfile metadata together.
2. Move relevant entries under `## MAJOR.MINOR.PATCH - YYYY-MM-DD`. Include user effects, migration,
   compatibility changes, and known limits; link issues/PRs when available. Use Added/Changed/Fixed/
   Removed/Security sections as needed.
3. Run `pnpm verify` and `pnpm test:changed:print`; complete the [AGENTS.md](AGENTS.md) checklist.
4. Merge release preparation through `dev` → `stage` → `main`.
5. Create immutable `vMAJOR.MINOR.PATCH` from the validated `main` commit. The publish workflow checks
   tag/version agreement and ancestry, verifies again, and uses npm trusted publishing.

A release is complete only after validation, arrival on `main`, and its matching tag. Never move/reuse
a published tag, omit breaking changes, or publish empty notes. Fix a release with a new version;
record corrections rather than silently rewriting published history.
