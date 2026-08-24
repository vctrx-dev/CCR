# CCR User Manual

Update this file whenever a user-facing skill, command, setting, or setup flow changes.

## Quick flow

```text
Install → Setup → Initialize → Review changes/codebase → Review findings → Approve any later fixes
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

Installation adds the CLI and, for project-local use, a programmatic Node.js API. Run `config init`
and `setup` in each repository to create the configuration, manual, skills, and context skeleton.
Hooks are added during initialization.

For a packed build from this repository:

```bash
npm install --save-dev /path/to/vctrx-ccr-VERSION.tgz
# or globally: npm install --global /path/to/vctrx-ccr-VERSION.tgz
```

Requires Node.js 22.12+ and Claude Code 2.1.0+.

### Programmatic API

Project-local consumers can import the supported ESM API from `@vctrx/ccr`. The focused subpaths are
`@vctrx/ccr/context`, `@vctrx/ccr/review`, and `@vctrx/ccr/llm`; do not import internal source paths
because they are not part of the compatibility contract. The root entry also supports CommonJS
`require`; focused subpaths are ESM-only to avoid duplicating the full SDK.

```ts
import {
  DEFAULT_CONTEXT_CONFIG,
  createAsuAimlProviderConfig,
  resolveContextConfig,
} from "@vctrx/ccr";

const config = resolveContextConfig(DEFAULT_CONTEXT_CONFIG, {
  privacy: { excludedPaths: ["internal/**"] },
});
const provider = createAsuAimlProviderConfig({
  apiKey: process.env.ASU_API_KEY ?? "",
  model: "gpt-5.2",
});
```

Importing the API does not alter a repository or contact a provider. Setup, writes, repository
evidence reads, and provider requests happen only when their explicit functions are called.

### Command help

Show all commands and Claude Code skills:

```bash
npx --no-install ccr help
```

Show help for one command:

```bash
npx --no-install ccr help setup
npx --no-install ccr context --help
npx --no-install ccr config --help
npx --no-install ccr hooks --help
```

For global installs, replace `npx --no-install ccr` with `ccr`. Slash operations run in Claude Code,
not a terminal. Help reads dimension IDs from the current registry.

## Config-managed hooks

Setup installs `/ccr-hooks`, but not the hooks themselves. With `hooks.enabled: true` (the default),
`/ccr-context initialize` runs `/ccr-hooks sync`. The skill selects a compatible framework, hook
path, interpreter, or minimal Git hook. Disable hooks before initialization if they are unwanted.

- `pre-commit` — warns when repository files are staged without a staged shared `.ccr/` file.
- `post-commit` — starts the commit journal and prints an update instruction when needed.

Hooks are advisory: they do not invoke Claude, edit context, block commits, or fail commits. Paste a
post-commit instruction into Claude Code to update the journal and, only when needed, `project.md`.

Inspect hooks with `npx --no-install ccr hooks status`. Remove provenance-managed hooks with
`/ccr-hooks remove`, then disable future sync with
`npx --no-install ccr config set hooks.enabled false --apply`. Provenance stores hashes and byte
counts, not contents, so removal can verify restoration. While provenance exists, the CLI defers
framework-aware removal to `/ccr-hooks`.

Hooks call `ccr hooks pre-commit` and `ccr hooks post-commit`. The old `check` and `after-commit`
names remain hidden compatibility aliases.

CCR validates provenance before trusting it. Missing state with existing markers is
legacy/unprovenanced; invalid state blocks automatic changes. Preserve or move invalid state for
investigation. After inspection, use `ccr hooks uninstall --apply` for marker-only cleanup, then
`/ccr-hooks sync`. Cleanup preserves bytes outside CCR markers.

## 2. Configure

```bash
npx --no-install ccr config init
npx --no-install ccr config init --apply
```

The first command previews; `--apply` creates or upgrades the configuration and its manual.

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

See `.ccr/config-manual.md` for every setting and accepted value.

`.ccr/config.json` is human-owned and changes require explicit approval. It is strict JSON. Defaults:

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

`config init` creates configuration files. `setup` adds Claude skills, `project.md`, and
`stakeholders.md`. It preserves existing context and instruction files. An obsolete generated
`index.md` is removed only when unedited. Hook strategy is selected later through repository analysis.

## 4. Initialize

Open Claude Code:

```text
/ccr-context initialize
```

Run this after setup. It populates the context skeleton and syncs hooks when enabled.

Claude uses repository evidence plus supplied plans or specifications. It scales discovery to the
repository, verifies material claims, preserves uncertainty and exceptions, and stops when important
evidence gaps close. Drafts stay in memory; temporary files use ignored `.ccr/tmp/` and are removed.

Claims cite paths and concrete symbols, tests, commands, or contracts. Plans remain intent unless
implementation evidence confirms them. Review the resulting `.ccr` changes. Validation inspects
every managed Markdown context file through a 10,000 UTF-16-character window; content beyond that
window is rejected as unvalidated, so shorten the file before validating it again. Independently, a
shared-context read returns at most 10,000 UTF-16 characters of source content and appends a
truncation marker when more content exists. If that marker appears, inspect the full file locally
before relying on it.

## 5. Review changes or the complete codebase

Review all configured dimensions by default:

```text
/ccr-review
/ccr-review all
/ccr-codebase
```

Review one or more dimensions by ID:

```text
/ccr-review fairness-evaluation, pedagogy
/ccr-codebase privacy
```

Current review dimensions: `fairness-evaluation`, `pedagogy`, `decision-fairness`, `inclusion`,
`transparency`, `privacy`. Run
`npx --no-install ccr help` to see the IDs bundled in the installed version.

`/ccr-review` checks staged, unstaged, and approved untracked changes. `/ccr-codebase` checks the
complete safe Git index plus live changes. Both use current `project.md`, `stakeholders.md`, and
recent local journals; code, tests, and schemas remain authoritative. The shared-context reader
accepts only `.ccr/project.md` and `.ccr/stakeholders.md`.

Each selected dimension gets exactly one subagent. That worker assesses every criterion in its
dimension and returns evidence-backed findings. The master agent collects, deduplicates, verifies,
and validates the findings before reporting them. Each bug includes:

```text
Severity: Critical | High | Medium | Low
File: repository/relative/path
Issue: evidence-backed incorrect behavior
Case: condition that triggers the bug
Dimension: selected dimension ID or IDs
```

Reviews never fix files without approval. Each run appends to the working journal, or the `HEAD`
journal on a clean tree. Working entries gain branch and commit fields after commit. Journals do not
duplicate Git's path inventory. `project.md` changes only for proven, durable high-level corrections.

### Maintain review dimensions

The package source of truth is `src/review/dimensions.json`. Its order is canonical. Each dimension
has this data-only shape:

```json
{
  "id": "privacy",
  "name": "Privacy",
  "summary": "What this dimension reviews.",
  "criteria": [
    {
      "id": "data-collection",
      "name": "Data collection",
      "details": "The complete research-backed criterion and review guidance."
    }
  ]
}
```

IDs are lowercase kebab-case selectors. Dimension and criterion IDs must be unique within their
respective scope. Change the taxonomy in this registry, then update matching README and user-manual
references and run package smoke. `scripts/package-smoke.mjs` derives the shipped help
and README assertion from the registry. Setup renders the validated installed registry once at
`.claude/skills/ccr/references/dimensions.md`; both review skills and `/ccr` read that shared file.

The included dimensions are an initial baseline. Replace them as the taxonomy matures. An empty
registry stops reviews instead of inventing criteria.

## Context operations

| Command | Purpose |
|---|---|
| `/ccr [question]` | Answer CCR usage questions |
| `/ccr-hooks sync` | Install or update hooks |
| `/ccr-hooks status` | Show hook status |
| `/ccr-hooks remove` | Remove CCR hooks |
| `/ccr-context initialize` | Create context |
| `/ccr-context update` | Update context from staged changes |
| `/ccr-context verify` | Verify context |
| `/ccr-context addition` | Add plans or knowledge |
| `/ccr-context compact` | Remove repetition |
| `/ccr-review [all\|dimension,...]` | Review current changes |
| `/ccr-codebase [all\|dimension,...]` | Review the complete codebase |

Review `.ccr` changes after every operation.

## Optional commit warning

Pre-commit warns about possibly stale shared context. Post-commit starts the journal and prints an
update instruction when needed. Neither blocks commits. Inspect with `ccr hooks status` or
`/ccr-hooks status`; remove with `/ccr-hooks remove`, then disable `hooks.enabled`.

## Privacy

Committed:

- `.ccr/config.json`
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

Run `/ccr-hooks remove` before uninstalling provenance-managed integration. The CLI will not claim
to remove an unknown framework entry.

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
