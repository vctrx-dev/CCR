# CCR User Manual

Update this file whenever a user-facing skill, command, setting, or setup flow changes.

## Quick flow

```text
Install → Configure → Setup → Initialize → Review context → Update when needed
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
then uses discovery subagents and a separate verification pass.

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

```bash
npx --no-install ccr hooks install
npx --no-install ccr hooks install --apply
```

The hook only warns when staged code has no staged context. It never changes files or blocks a
commit.

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
