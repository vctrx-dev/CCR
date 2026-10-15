# CCR — Critical Code Reviewer

[![npm version](https://img.shields.io/npm/v/@vctrx/ccr)](https://www.npmjs.com/package/@vctrx/ccr)

CCR uncovers ethical and inclusivity bugs developers may not have anticipated—even when the code
works as intended. It reviews assumptions, rules, and wording that can exclude people, treat them
unfairly, or limit their privacy, learning, and control. Findings explain human consequences in plain
language with code evidence. CCR runs in Claude Code, not as a general code-quality checker, and
does not change source code without your approval.

**Requirements:** Node.js 22.12+, Git, and Claude Code 2.1.169+ installed and signed in.

## Quick start

In your project's Git repository, run:

```bash
npx @vctrx/ccr@latest setup
```

CCR is in beta. While its version is 0.x, a minor release (for example 0.12 → 0.13) may include
breaking changes; the [changelog](CHANGELOG.md) explains each one and any migration.

Setup creates the configuration, context files, Claude Code skills, and a self-contained runtime
in the Git-ignored `.ccr/private/runtime` directory. No global install or project dependency is
needed. Skills and hooks use that runtime, even after npm's cache is cleared. Existing context and
custom settings are preserved. To preview first, use `npx @vctrx/ccr@latest setup --dry-run`.

Open Claude Code in the same repository and run these one at a time:

```text
/ccr-context initialize
/ccr-review codebase all
```

Initialization asks about your project and the people it affects. Answer its questions, check the
generated context, then run the review. After that, just commit as usual: hooks installed during
initialization keep the journal and project context current in the background, never block a
commit, and print at most one short line.

### Terminal commands and optional installations

After setup, terminal examples using `ccr` can be run as
`node .ccr/private/runtime/dist/cli/index.cjs` followed by the same arguments.
For example: `node .ccr/private/runtime/dist/cli/index.cjs config validate`.
Claude Code runs these support commands itself; you only need the slash commands above.

Global and project-local npm installations are optional. For a global installation, use
`npm install --global @vctrx/ccr@latest`, then `ccr setup`. For a local installation:

Install in the repository, then use `npx ccr` instead of `ccr` for terminal commands:

```bash
npm install --save-dev @vctrx/ccr@latest
npx ccr setup
```

With pnpm, use `pnpm add --save-dev @vctrx/ccr@latest` and `pnpm exec ccr setup`.
Install the package before using `npx ccr`; otherwise npx may try to download a different package
named `ccr`. Claude Code slash commands are the same for either installation.

## Claude Code skills

| Skill | Purpose |
|---|---|
| `/ccr [question]` | Get help with CCR |
| `/ccr-context initialize` | Set up project context and enabled hooks |
| `/ccr-context update` | Update context after meaningful project changes |
| `/ccr-context verify` | Check context against current evidence |
| `/ccr-context addition` | Add facts or plans you provide |
| `/ccr-context compact` | Shorten project context by at most 25% |
| `/ccr-hooks status` | Inspect CCR's Git hook integration |
| `/ccr-review` | Review your current changes |

**Slash commands run inside Claude Code.** Terminal commands such as `ccr setup` and `ccr help`
run in your shell.

## Reviews and editable dimensions

```text
/ccr-review
/ccr-review codebase
/ccr-review codebase dimension data-system-reliability
/ccr-review codebase data-system-reliability alignment-with-teaching-learning
/ccr-review codebase dimension
/ccr-review PR-123
/ccr-review changes privacy-data-protection,inclusion-accessibility
```

- **Changes** includes staged, unstaged, and approved untracked work; this is the default scope.
- **Codebase** reviews tracked files plus approved current changes.
- **PR** reviews the specified GitHub pull request and requires GitHub CLI (`gh`) installed and
  authenticated. It does not check out the PR branch.

`all` means every configured dimension and is the default when no selection is given. A dimension
is a review category, such as Data & System Reliability. To review only that category across the
whole codebase, run `/ccr-review codebase dimension data-system-reliability`. The `dimension`
keyword is optional; any dimension ID from `ccr context dimensions` works. Separate multiple IDs
with spaces or commas to review only those dimensions. `/ccr-review codebase dimension` lists all
available dimension IDs and names, asks which one or more you want, and waits for your selection.
Selecting specific dimensions limits both investigation and findings to those dimensions. Use
`ccr context dimensions --json` for the current list of IDs, names, and criteria.

Findings are numbered, separated, and ordered by severity. Each explains who is affected, a scenario,
and supporting evidence. Unconfirmed concerns stay out of the findings; a clean report is not a
guarantee of safety. See the [review guide](USER_MANUAL.md#stakeholder-impact-review) for details.

JSON is the source of truth and is reread on every review. A repository's
`src/review/dimensions.json` takes priority when present; otherwise customized `.ccr/dimensions.json`
applies. Untouched setup copies follow current package JSON from disk. Edits take effect on the
next review without rebuilding or rerunning setup. Use `ccr context dimensions --reference` for a
current Markdown reference. Leave optional `_ccr` metadata unchanged when customizing repository JSON.
Invalid files stop the review. See [customization](USER_MANUAL.md#editable-review-taxonomy) for the
schema and limits.

## Context, privacy, and hooks

- Commit `.ccr/config.json`, `.ccr/dimensions.json`, and the project, stakeholder, and decision
  Markdown files so your team shares the same review context.
- Keep local configuration, journals, private state, cache, and temporary files ignored by Git.
- Never put secrets, credentials, personal records, or private conversations in shared context.
- Edit `.ccr/config.json` to change settings. Use `ccr config validate` to check it.
- Privacy exclusions filter review evidence; configure extra exclusions with `privacy.excludedPaths`.
- New setups update context automatically after each commit in the background using Claude Code.
  Set `hooks.checkBeforeCommit` to `false` to update manually with `/ccr-context update last commit`.
- Reviews read the active journal plus the latest non-empty journal entry (`context.recentJournalEntries`,
  default 1).

See the [manual](USER_MANUAL.md) for settings, context ownership, and hook permissions.

## Update or remove CCR

Refresh each repository's skills and retained runtime:

```bash
npx @vctrx/ccr@latest update
```

For an optional global or local installation, upgrade the package and run `ccr update` or
`npx ccr update`, respectively.
Updating preserves your configuration, context, journals, and custom dimensions.

To remove CCR integration, run in the terminal:

```bash
npx @vctrx/ccr@latest uninstall
```

For an optional global installation, remove repository integration before `npm uninstall --global @vctrx/ccr`.
For a local installation, use `npx ccr uninstall`, then `npm uninstall @vctrx/ccr`.
Uninstall deletes all project CCR data by default; add `--keep-context` to preserve `.ccr` data.
Use `--dry-run` to preview update or uninstall changes.

For full project cleanup, including journals, local settings, and caches:

```sh
npx @vctrx/ccr@latest uninstall --dry-run
npx @vctrx/ccr@latest uninstall
```

`uninstall` deletes the entire `.ccr` folder and removes verified CCR hook integration, skills, and
instruction blocks. Unrelated hook commands and files are preserved. Cleanup stops if ownership,
original hook bytes, or path safety cannot be verified. This removes files, not a forensic secure
erase, and does not remove Git history, npm dependencies, or the shared npx cache.

## Help and further reading

- Run `ccr help` for terminal help or `/ccr [question]` inside Claude Code.
- Run `ccr --version` to check your installed version.
- [User manual](USER_MANUAL.md): settings, detailed workflows, and the programmatic API.
- [Changelog](https://github.com/vctrx-dev/CCR/blob/main/CHANGELOG.md): changes and migrations.
- [Project purpose](https://github.com/vctrx-dev/CCR/blob/main/AGENTS.md): background for contributors.

The GitHub Action remains on the roadmap and is not claimed as available.
