# CCR User Manual

Update this file whenever a user-facing skill, command, setting, or setup flow changes.

## Quick flow

```text
Install → Setup → Initialize → Preload context → Review → Journal/context sync → Amend with feedback
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
post-commit instruction into Claude Code to preload shared context and configured recent journals,
complete the same commit journal, and update `project.md` only when durable high-level context changed.

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
npx --no-install ccr config set instructions.updateDecisionsMd true --apply
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
    "updateAgentsMd": false,
    "updateDecisionsMd": false
  }
}
```

## 3. Setup

```bash
npx --no-install ccr setup
npx --no-install ccr setup --apply
```

`config init` creates configuration files. `setup` adds Claude skills, `project.md`, `stakeholders.md`,
and an empty `decisions.md`. It preserves existing context and instruction files. An obsolete generated
`index.md` is removed only when unedited. On upgrade, the former package-managed
`.claude/skills/ccr-codebase/SKILL.md` is retired. Package-marked variants are removed because their
header authorizes package replacement; user-owned or foreign-marked files are preserved.
Hook strategy is selected later through repository analysis.

### Update after a package upgrade

```bash
npx --no-install ccr update
npx --no-install ccr update --apply
```

Run this after updating `@vctrx/ccr`. It previews by default and refreshes only package-managed
skills, progressive-disclosure resources, and CCR-marked instruction blocks. It preserves
`.ccr/config.json`, `project.md`, `stakeholders.md`, `decisions.md`, local journals, private state,
and user-owned files. A foreign or malformed managed skill stops the update instead of replacing it.

## 4. Initialize

Open Claude Code:

```text
/ccr-context initialize
```

Run this after setup. It populates `project.md` and `stakeholders.md`, leaves `decisions.md` empty,
and syncs hooks when enabled. After initialization, CCR always reads `stakeholders.md` but never
updates it automatically; stakeholder changes are human-owned.

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

## 5. Review changes, the complete codebase, or a pull request

Review all configured dimensions by default:

```text
/ccr-review
/ccr-review all
/ccr-review changes
/ccr-review codebase
```

Review one or more dimensions by ID:

```text
/ccr-review fairness-evaluation, pedagogy
/ccr-review codebase privacy
/ccr-review PR-123 fairness-evaluation, privacy
```

Current review dimensions: `fairness-evaluation`, `pedagogy`, `decision-fairness`, `inclusion`,
`transparency`, `privacy`. Run
`npx --no-install ccr help` to see the IDs bundled in the installed version.

`/ccr-review` and `/ccr-review changes` check staged, unstaged, and approved untracked changes.
`/ccr-review codebase` checks the complete safe Git index plus live changes. `/ccr-review PR-123`
uses read-only GitHub CLI metadata, the pull-request patch, and relevant head content; it does not
checkout or mutate branches. Before dispatching review workers, every scope reads current
`project.md`, `stakeholders.md`, and `decisions.md`, then reads every bounded journal returned within
the configured `context.recentJournalEntries` count. Changes and codebase scopes use the current
branch history; PR scope uses that PR's isolated history. These files remain advisory context; code,
tests, and schemas remain authoritative. The shared-context
reader accepts only `.ccr/project.md`, `.ccr/stakeholders.md`, and `.ccr/decisions.md`.
PR evidence is bounded to 64 KiB of metadata, 200 changed paths, a 512 KiB patch, 128 KiB per head
file, and 2 MiB total. The internal `ccr context review-pr` and `review-pr-head` commands enforce
those limits and configured privacy exclusions before evidence reaches review workers. If a PR
contains an excluded path or exceeds a limit, review reports a blocker and stops before dispatch.

The general form is `/ccr-review [changes|codebase|PR-<number>] [all|dimension,...]`. A missing scope
defaults to `changes`, and a selector without a scope remains a changes review for compatibility.
Invalid scopes, PR numbers, duplicate IDs, mixed `all` selections, and unknown dimension IDs stop
before review or journal writes. PR review requires an authenticated `gh` CLI and never uses the
current working tree as PR evidence.

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

Reviews never fix files without approval. A change review reuses the working journal, a clean-tree
review reuses the `HEAD` journal, and every `PR-<number>` reuses one PR-specific journal. Working
entries gain branch and commit fields after commit. Human feedback about the same code—such as
marking findings as false positives—amends the same journal entry and review-run section instead of
creating another. Each completed review replaces the journal's initial summary placeholder with a
concise factual scope, evidence, and outcome record. Journals do not duplicate Git's path inventory. `project.md` changes only for a
verified major feature, architecture, public workflow, product constraint, stakeholder impact, or
plan change; routine bug fixes and findings stay in the journal. CCR never updates `stakeholders.md`
after initialization.
`decisions.md` is human-owned. It starts empty; review can append at most one concise decision only
when `instructions.updateDecisionsMd` is `true`, the human confirms the durable future-review rule
or repository evidence directly states the decision, and `ccr context append-decision <decision>`
accepts the bounded entry. A finding or recommendation alone is not a decision.
The default is `false`, so reviews otherwise leave the file unchanged.

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
`.claude/skills/ccr/references/dimensions.md`; `/ccr-review` and `/ccr` read that shared file.

The included dimensions are an initial baseline. Replace them as the taxonomy matures. An empty
registry stops reviews instead of inventing criteria.

## Context operations

| Command | Purpose |
|---|---|
| `/ccr [question]` | Answer CCR usage questions |
| `/ccr-hooks sync` | Install or update hooks |
| `/ccr-hooks status` | Show hook status |
| `/ccr-hooks remove` | Remove CCR hooks |
| `/ccr-context initialize` | Populate project and stakeholder context |
| `/ccr-context update` | Complete the current journal and update durable context |
| `/ccr-context verify` | Verify context |
| `/ccr-context addition` | Add plans or knowledge |
| `/ccr-context compact` | Compact project context only |
| `/ccr-review [scope] [all\|dimension,...]` | Review changes, codebase, or a pull request |
| `ccr context append-decision <decision>` | Append one config-authorized decision line |
| `ccr context journals [PR-<number>]` | Read configured recent branch or PR journals |
| `ccr context review-pr PR-<number>` | Read bounded privacy-filtered PR metadata and patch |
| `ccr context review-pr-head PR-<number> <files...>` | Read up to eight approved PR head files |

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
- `.ccr/decisions.md`

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
