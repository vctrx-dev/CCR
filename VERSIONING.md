# Releases

CCR follows [Semantic Versioning](https://semver.org). `package.json` is the version source, every
release is published to npm's `latest` tag, and a `vMAJOR.MINOR.PATCH` Git tag triggers publishing.

CCR is in beta while its version is 0.x: incompatible changes increment MINOR (0.12 → 0.13) and
everything else increments PATCH. Leaving beta means releasing 1.0.0; after that, incompatible changes
increment MAJOR. Do not use separate channel tags or labels such as `beta-0.2`.

1. On `dev`, run `npm version <minor|patch> --no-git-tag-version`. Move the `CHANGELOG.md`
   `Unreleased` entries under `## MAJOR.MINOR.PATCH - YYYY-MM-DD`, using Added/Changed/Fixed/Removed/
   Security sections and migration notes for incompatible changes.
2. Run `pnpm verify`.
3. Merge the release through `dev` → `stage` → `main`.
4. Tag the `main` commit and push the tag:

   ```bash
   git fetch origin
   git tag -a vMAJOR.MINOR.PATCH origin/main -m "vMAJOR.MINOR.PATCH"
   git push origin vMAJOR.MINOR.PATCH
   ```

   The publish workflow checks that the tag matches `package.json` and is on `main`, verifies again,
   and publishes to `latest` with npm trusted publishing.

Do not hard-code the current version in documentation; `@latest` and the npm badge show it. Never move
or reuse a published tag or version. Fix a bad release with a new PATCH release.
