# Versioning and Release Notes

`package.json` is the source of truth for the CCR version. Git release tags use the corresponding
`vMAJOR.MINOR.PATCH` form.

## Preparing a release

1. Decide the next version from the user-visible changes under `Unreleased` in `CHANGELOG.md`.
2. Update `package.json` and the lockfile to the same version.
3. Move the applicable changelog entries into `## MAJOR.MINOR.PATCH - YYYY-MM-DD`.
4. Include migration instructions, known limitations, and compatibility changes when applicable.
5. Run the complete self-review checklist from `AGENTS.md`.
6. Merge the release-preparation change through the normal branch flow into `main`.
7. Create the immutable tag `vMAJOR.MINOR.PATCH` from the validated commit.

## Release-note quality

Write for users rather than for the implementation history. Group entries under `Added`, `Changed`,
`Fixed`, `Removed`, and `Security` as applicable. Every entry should explain the observable effect.
Link an issue or pull request when one exists.

Do not publish an empty release note, silently omit a breaking change, move an existing release tag,
or edit the notes for an already published version without recording the correction.
