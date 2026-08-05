# CCR User Manual

Update this file whenever a user-facing skill, command, setting, or setup flow changes.

## Quick flow

```text
Install → Initialize → Review context → Claude updates context and journal after each commit
```

## 1. Install

```bash
npm install --save-dev @vctrx/ccr
```

Local package:

```bash
npm install --save-dev /path/to/vctrx-ccr-VERSION.tgz
```

Requires Node.js 22.12+ and Claude Code 2.1.0+.

## Automatic hooks

Installing the package runs `ccr hooks install --apply` automatically (npm/yarn; for pnpm, approve
`@vctrx/ccr` in `pnpm.onlyBuiltDependencies`). It installs two advisory Git hooks and keeps local
context directories ignored:

- `pre-commit` — warns when repository files are staged without a staged shared `.ccr/` file.
- `post-commit` — after every commit, starts a branch-local journal entry when none exists, warns
  (without blocking) when the last commit changed repository files without updating shared context,
  and prints a copy-paste instruction for Claude Code.

After a commit, paste the printed instruction into Claude Code. Claude reviews the last commit,
completes the journal entry in `.ccr/journal/`, and changes `.ccr/project.md` only when the commit
affects the repository's high-level context. Most commits do not change `.ccr/project.md`.

Both hooks are advisory: they never block a commit, edit files by themselves, or fail the commit.
Remove them with `npx --no-install ccr hooks uninstall --apply`.

## 2. Configure

```bash
npx --no-install ccr config init
npx --no-install ccr config init --apply
```

The first command previews the config. The second creates or upgrades `.ccr/config.json`.

Review the settings and validate:

```bash
npx --no-install ccr config validate
```

CCR and Claude do not change config unless you explicitly request or approve it.

## 3. Setup

```bash
npx --no-install ccr setup
npx --no-install ccr setup --apply
```

Setup adds the Claude skills and these shared context files:

- `.ccr/index.md`
- `.ccr/project.md`
- `.ccr/stakeholders.md`

Existing context, `CLAUDE.md`, and `AGENTS.md` are preserved by default.

## 4. Initialize

Open Claude Code:

```text
/ccr-context initialize
```

You may provide plans, specifications, or other information not stored in the repository. Claude
then uses evidence traces and a separate verification pass. The resulting `project.md` is one
connected narrative that weaves real-world purpose, logic, technical constraints, and small but
consequential details together instead of splitting them into fixed categories.

Review the resulting `.ccr` changes.

## Context operations

| Command | Purpose |
|---|---|
| `/ccr` | Show the CCR manual |
| `/ccr-context initialize` | Create repository context |
| `/ccr-context update` | Update context from staged changes |
| `/ccr-context verify` | Check whether context is accurate and current |
| `/ccr-context addition` | Add human-provided plans or knowledge |
| `/ccr-context compact` | Remove repetition without losing key context |

Review `.ccr` changes after every operation.

## Optional commit warning

Both Git hooks are advisory. The pre-commit hook warns when repository files are staged without a
staged shared `.ccr/` file. After each commit, the post-commit hook starts a local journal entry and
prints a copy-paste prompt; pasting it into Claude Code updates the shared context and completes the
journal, changing `.ccr/project.md` only when the commit affects the repository's high-level context.
Neither hook blocks a commit. Check or remove them with `npx --no-install ccr hooks status` and
`npx --no-install ccr hooks uninstall --apply`.

## Privacy

Committed:

- `.ccr/config.json`
- `.ccr/index.md`
- `.ccr/project.md`
- `.ccr/stakeholders.md`

Local and ignored:

- `.ccr/config.local.json`
- `.ccr/journal/`
- `.ccr/private/`
- `.ccr/cache/`
- `.ccr/tmp/`

Never store secrets, credentials, student records, or personal data in shared context.

## Check status

```bash
npx --no-install ccr context status
npx --no-install ccr context validate
npx --no-install ccr config validate
npx --no-install ccr hooks status
```

## Uninstall

Preview:

```bash
npx --no-install ccr uninstall
```

Remove CCR but preserve shared context:

```bash
npx --no-install ccr uninstall --apply
```

Also remove shared context:

```bash
npx --no-install ccr uninstall --apply --remove-context
```

Local journals and private state remain preserved.
