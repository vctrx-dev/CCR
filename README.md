# CCR — Critical Code Reviewer

CCR uncovers ethical and inclusivity bugs developers may not have anticipated—even when the code
works as intended. It reviews assumptions, rules, and wording that can exclude people, treat them
unfairly, or limit their privacy, learning, and control. Findings explain human consequences in plain
language with code evidence. CCR runs in Claude Code, not as a general code-quality checker, and
does not change source code without your approval.

**Requirements:** Node.js 22.12+, Git, and Claude Code 2.1.0+ installed and signed in.

## Quick start

Install CCR globally:

```bash
npm install --global @vctrx/ccr@latest
```

The current release is **0.12.0**. Every release is published to npm's `latest` tag, so
`@vctrx/ccr@latest` (or no tag) always installs the newest version.

In your project's Git repository, run:

```bash
ccr setup
```

Setup creates the configuration, context files, and Claude Code skills. Existing context and custom
settings are preserved. To preview the changes first, use `ccr setup --dry-run`.

Open Claude Code in the same repository and run these one at a time:

```text
/ccr-context initialize
/ccr-review changes
```

Initialization asks about your project and the people it affects. Answer its questions, check the
generated context, then run the review. After that, just commit as usual: hooks installed during
initialization keep the journal and project context current in the background, never block a
commit, and print at most one short line.

### Prefer a project-local installation?

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
/ccr-review PR-123
/ccr-review changes privacy-data-protection,inclusion-accessibility
```

- **Changes** includes staged, unstaged, and approved untracked work; this is the default scope.
- **Codebase** reviews tracked files plus approved current changes.
- **PR** reviews the specified GitHub pull request and requires GitHub CLI (`gh`) installed and
  authenticated. It does not check out the PR branch.

All dimensions are reviewed by default. To select specific ones, use comma-separated IDs from
`ccr context dimensions`. The defaults cover seven dimensions and 28 criteria.

Findings are numbered, separated, and ordered by severity. Each explains who is affected, a scenario,
and supporting evidence. Unconfirmed concerns stay out of the findings; a clean report is not a
guarantee of safety. See the [review guide](USER_MANUAL.md#stakeholder-impact-review) for details.

To customize criteria, edit `.ccr/dimensions.json`. The next review uses your edits without rebuilding
or rerunning setup, and updates preserve customization. Leave optional `_ccr` metadata unchanged.
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

For a global installation, upgrade the package, then refresh each repository's installed skills:

```bash
npm install --global @vctrx/ccr@latest
ccr update
```

For a local installation, run `npm install --save-dev @vctrx/ccr@latest`, then `npx ccr update`.
Updating preserves your configuration, context, journals, and custom dimensions.

To remove CCR integration, first run `/ccr-hooks remove` inside Claude Code, then in the terminal:

```bash
ccr uninstall
npm uninstall --global @vctrx/ccr
```

Remove integration from every repository using the global installation before removing the package.
For a local installation, use `npx ccr uninstall`, then `npm uninstall @vctrx/ccr`.
Context is kept by default; add `--remove-context` to `ccr uninstall` only if you also want to delete
shared context. Use `--dry-run` to preview update or uninstall changes.

## Help and further reading

- Run `ccr help` for terminal help or `/ccr [question]` inside Claude Code.
- Run `ccr --version` to check your installed version.
- [User manual](USER_MANUAL.md): settings, detailed workflows, and the programmatic API.
- [Changelog](https://github.com/vctrx-dev/CCR/blob/main/CHANGELOG.md): changes and migrations.
- [Contributor tests](TEST.md) and
  [project purpose](https://github.com/vctrx-dev/CCR/blob/main/AGENTS.md): background for contributors.

The GitHub Action remains on the roadmap and is not claimed as available.
