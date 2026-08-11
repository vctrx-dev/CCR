# CCR User Manual

Update this file whenever a user-facing skill, command, setting, or setup flow changes.

## Quick flow

```text
Install → Setup → Initialize → Review context → Claude updates context and journal after each commit
```

## 1. Install

Choose one scope:

Project-local package, recommended when the repository should own the CCR version:

```bash
npm install --save-dev @vctrx/ccr
# or: pnpm add --save-dev @vctrx/ccr

npx --no-install ccr config init --apply
npx --no-install ccr setup --apply
```

Global CLI, useful when one CLI should serve multiple repositories:

```bash
npm install --global @vctrx/ccr
# or: pnpm add --global @vctrx/ccr

cd /path/to/your/repository
ccr config init --apply
ccr setup --apply
```

The global install only installs the CLI; run commands from each target repository. Neither install
creates the shared `.ccr` files or Git hooks by itself. `ccr config init --apply` creates the
human-readable `.ccr/config-manual.md` next to `.ccr/config.json`; `ccr setup --apply` installs the
CCR skills and context skeleton.

For a packed build from this repository:

```bash
npm install --save-dev /path/to/vctrx-ccr-VERSION.tgz
# or globally: npm install --global /path/to/vctrx-ccr-VERSION.tgz
```

Requires Node.js 22.12+ and Claude Code 2.1.0+.

## Config-managed hooks

Hooks are not installed during package installation or directly by setup. Setup installs the
repository-aware `/ccr-hooks` skill. `hooks.enabled` defaults to `true`, so
`/ccr-context initialize` invokes `/ccr-hooks sync`; the skill inspects the repository before it
chooses an existing hook framework, configured `core.hooksPath`, current hook interpreter, or a
minimal direct Git hook. Set `hooks.enabled` to `false` before initialization when the repository
should not have CCR hook integration. Setup also keeps local context directories ignored and removes
legacy CCR-managed hook blocks when hooks are disabled.

- `pre-commit` — warns when repository files are staged without a staged shared `.ccr/` file.
- `post-commit` — after every commit, starts a branch-local journal entry when none exists, warns
  (without blocking) when the last commit changed repository files without updating shared context,
  and prints a copy-paste instruction when context is stale or a journal entry needs completing.
  A context-only commit records its paths in the journal without prompting again.

After a commit, paste the printed instruction into Claude Code. Claude reviews the last commit,
completes the journal entry in `.ccr/journal/`, and changes `.ccr/project.md` only when the commit
affects the repository's high-level context. Most commits do not change `.ccr/project.md`.

Both hooks are advisory: they never invoke Claude automatically, block a commit, edit shared context
by themselves, or fail the commit. The post-commit hook prints a copy-paste prompt when context or a
journal needs attention. You can inspect them with `npx --no-install ccr hooks status`; the normal
configuration path for removing them is `/ccr-hooks remove`, followed by
`npx --no-install ccr config set hooks.enabled false --apply` so future initialization leaves them
disabled. Native-hook provenance includes the original byte length/hash and managed separator byte
count, allowing removal to verify exact restoration without storing hook contents.
While `.ccr/private/hooks-state.json` exists, use `/ccr-hooks status` or `/ccr-hooks remove`.
The CLI cannot safely interpret every repository-native framework or language hook, so its uninstall
commands stop without changing files until the skill has removed and verified that managed state.
Legacy CLI status distinguishes malformed CCR markers, unsafe configured paths, and unavailable Git
metadata. Cleanup validates both legacy hooks before changing either one; setup and uninstall stop
before their managed-file writes when those markers are malformed.

## 2. Configure

```bash
npx --no-install ccr config init
npx --no-install ccr config init --apply
```

The first command previews the config and changes nothing. `--apply` is the explicit write
confirmation, so the second command creates or upgrades `.ccr/config.json` and
`.ccr/config-manual.md`.

After it succeeds, edit `.ccr/config.json` directly or use the validated updater:

```bash
npx --no-install ccr config set domain your-domain --apply
npx --no-install ccr config set hooks.enabled false --apply
npx --no-install ccr config set hooks.checkBeforeCommit false --apply
npx --no-install ccr config set instructions.updateClaudeMd true --apply
```

Review the settings and validate:

```bash
npx --no-install ccr config validate
```

Read `.ccr/config-manual.md` for the meaning, accepted values, and practical effect of every key.
Its sections follow the same order as `.ccr/config.json`.

`.ccr/config.json` is human-owned. CCR, Claude, and other AI coding agents must not change it unless
you explicitly approve the exact setting and value. The file is strict JSON, so it intentionally has
no `//` comments or helper fields. The default file is:

```json
{
  "domain": "unspecified",
  "hooks": {
    "enabled": true,
    "checkBeforeCommit": true
  },
  "context": {
    "recentJournalEntries": 3,
    "maxCompactionPercent": 25
  },
  "instructions": {
    "updateClaudeMd": false,
    "updateAgentsMd": false
  }
}
```

## 3. Setup

```bash
npx --no-install ccr setup
npx --no-install ccr setup --apply
```

`ccr config init --apply` creates `.ccr/config.json` and `.ccr/config-manual.md`.
`ccr setup --apply` adds the Claude skills and these shared context files:

- `.ccr/index.md`
- `.ccr/project.md`
- `.ccr/stakeholders.md`

Existing context, `CLAUDE.md`, and `AGENTS.md` are preserved by default.
Setup installs `/ccr-hooks`; it does not guess a hook strategy without repository analysis.

## 4. Initialize

Open Claude Code:

```text
/ccr-context initialize
```

Run this after `ccr setup --apply`. The prompt populates the existing context skeleton; it does not
replace the setup command that creates the `.ccr` folder and files. When hooks are enabled, it also
invokes `/ccr-hooks sync` once.

You may provide plans, specifications, or other information not stored in the repository. Claude
maps independent evidence traces and runs them in an adaptive parallel agent wave, using more agents
for multi-language or very large repositories, then performs a separate verification pass. The
resulting `project.md` is one connected narrative that weaves real-world purpose, logic, technical
constraints, and small but consequential details together instead of fixed categories. Focused
later operations use no discovery subagent for one trace; update, verify, and addition target five
minutes, while semantic compact targets eight. Broader repairs use one bounded parallel wave before
verification. A focused verifier reviews the supplied draft and evidence packet without launching
another repository search. Drafts stay in memory; CCR operations do not leave scratch files in the
repository root. Any harness-required temporary file is confined to ignored `.ccr/tmp/` and removed
before completion.

Material claims use full repository-relative files and concrete symbols, tests, commands, or prose
contracts. Workflow/config summaries enumerate the collection and preserve trigger or role
exceptions instead of treating every member as uniform. Human-supplied additions remain intent;
omitting an implementation claim is not treated as proof that no implementation evidence exists.

Review the resulting `.ccr` changes.

## Context operations

| Command | Purpose |
|---|---|
| `/ccr` | Show the CCR manual |
| `/ccr-hooks sync` | Detect and apply repository-native hook integration |
| `/ccr-hooks status` | Explain the current hook strategy |
| `/ccr-hooks remove` | Remove only CCR-managed hook integration |
| `/ccr-context initialize` | Create repository context |
| `/ccr-context update` | Update context from staged changes |
| `/ccr-context verify` | Check whether context is accurate and current |
| `/ccr-context addition` | Add human-provided plans or knowledge |
| `/ccr-context compact` | Remove repetition without losing key context |

Review `.ccr` changes after every operation.

## Optional commit warning

Both Git hooks are advisory. The pre-commit hook warns when repository files are staged without a
staged shared `.ccr/` file. After each commit, the post-commit hook starts a local journal entry and,
when context is stale or a journal entry needs completing, prints a copy-paste prompt; pasting it
into Claude Code updates the shared context and completes the journal, changing `.ccr/project.md`
only when the commit affects the repository's high-level context. Neither hook blocks a commit.
Check the managed blocks with `npx --no-install ccr hooks status`, or ask `/ccr-hooks status` for the
repository-aware explanation. Remove them with `/ccr-hooks remove`, then disable future sync with
`npx --no-install ccr config set hooks.enabled false --apply`.

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

Never store secrets, credentials, private records, or personal data in shared context.

## Check status

```bash
npx --no-install ccr context status
npx --no-install ccr context validate
npx --no-install ccr config validate
npx --no-install ccr hooks status
```

## Uninstall

If `/ccr-hooks sync` created provenance-managed integration, run `/ccr-hooks remove` first. CCR
will stop the CLI uninstall rather than claim that an unknown framework entry was removed.

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
