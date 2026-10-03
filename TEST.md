# Testing CCR

Use automated gates for deterministic behavior and disposable repositories for real Claude/GitHub
workflows. Package smoke proves installation integrity, not model review quality.

## Automated checks

From the CCR checkout:

```bash
pnpm install
pnpm verify
pnpm test:changed:print
```

`verify` runs tracked-file safety, audit, typecheck, lint, coverage, build, and packed-install smoke.
Typecheck rejects unused source imports, locals, and parameters. Individual suites are
`pnpm test:unit`, `pnpm test:integration`, and `pnpm test:e2e`; use `pnpm test:coverage` for thresholds.
Never weaken a gate or coverage threshold to pass a change.

Tests exercise observable behavior through stable boundaries. Reuse temporary Git helpers in
`tests/helpers/test-environment.ts`. Parsers, privacy, filesystem/Git bounds, lifecycle operations,
locks, and orchestration need behavioral coverage. Prompt prose and specific taxonomy wording/IDs
must not use snapshots or exact-string assertions; validate schema, packaging, and model behavior.

For dead-code cleanup, trace runtime, test, tooling, and public-export callers. Keep useful safety
coverage and published APIs; zero internal callers alone is insufficient. Current strict flags cover
source, not the test tree.

## Install a real package

> Use a disposable clone for commits, malformed state, races, and artificial defects. Back up CCR
> context, skills, instructions, and hooks before testing an existing target.

For release testing, install `@vctrx/ccr@VERSION`. For an unpublished build, run `npm pack` after
verification and install the resulting tarball—not the source folder—in the target repository:

```bash
npm install --save-dev /path/to/vctrx-ccr-VERSION.tgz
npx --no-install ccr --version
npx --no-install ccr config init --dry-run
npx --no-install ccr config init
npx --no-install ccr setup --dry-run
npx --no-install ccr setup
npx --no-install ccr setup
npx --no-install ccr context validate
```

Check the version against the tested manifest; `-v` and `-version` must agree. Repeated setup must be
idempotent. Existing human-owned config, context, journals, private state, and unrelated instruction
content must survive. Upgrade the package, preview `ccr update`, then apply it and inspect the diff.

### Taxonomy checks

1. Confirm setup creates parseable `.ccr/dimensions.json` matching packaged defaults.
2. Edit a dimension/criterion and run `ccr context dimensions` and `--json`. Both must reflect the
   current file without setup/rebuild; the next skill review must use the edit.
3. Update a customized file: preserve it. Update an untouched older default: refresh it. Ordinary
   uninstall preserves taxonomy; explicit context removal deletes it.
4. Test missing, empty, malformed, oversized, non-UTF-8, and symlink input. Only absence falls back;
   empty taxonomy stops review; invalid input fails closed without private excerpts.
5. Confirm taxonomy edits change review freshness and the raw JSON export is packaged. Surrounding
   review guidance and reporting must remain unchanged by taxonomy edits. The packaged
   `dist/review/dimensions.md` and installed reference must match the JSON-derived Markdown.

## Context and evidence

In Claude Code, initialize, verify, supply an addition, and update context. Check:

- Initialization asks unresolved project/stakeholder questions before finalizing. Clarified facts
  become plain-language prose; skipped facts remain honest limits, with no transcript/question backlog.
- Project context describes people and consequential rules, not implementation inventories.
  Include indirectly affected roles and existing safeguards; do not invent populations or impacts.
- Stakeholders are writable only during initialization. Technical-only refactors stay in journals;
  durable changes to people's activities update project context.
- Decisions preserve human entries and require the separate append opt-in. Bare disagreement or
  code-derived policy is not reusable human rationale.
- Configuration approval and the one-time untouched default-domain exception are respected.

Use `context files`, `recent`, `shared .ccr/project.md`, and `journals` to inspect the broker. Follow
`nextCursor` when paths are omitted. `journals PR-123` excludes that PR's active entry but still selects
history repository-wide; it is not a PR history filter.

Test staged/unstaged divergence, approved untracked files, deletions, renames, binary/malformed UTF-8,
symlinks, submodules, secrets, wildcard-like filenames, and oversized input. Excluded/private content
must never be returned. Truncation/deletion/binary markers must be explicit. Config syntax errors
must not quote private input. Merge evidence uses the first parent; root commits use the empty tree.

## Review scopes and selection

```text
/ccr-review
/ccr-review changes privacy-data-protection
/ccr-review codebase human-control-review, privacy-data-protection
/ccr-review PR-123 fairness-non-discrimination
```

Use effective IDs from `ccr context dimensions --json`. Test a unique minor misspelling, an ambiguous
token, invalid scope/ID, `PR-0`, duplicates, empty comma items, mixed `all`, and extra arguments.
Unique skill-argument typos normalize; invalid/ambiguous input stops before review or journal writes.
PR numbers, paths, config values, flags, terminal commands, and free-form additions never change.

| Scope | Expected evidence |
|---|---|
| Changes | Approved staged, unstaged, and untracked work plus relevant surrounding flow |
| Codebase | Complete safe Git index with approved live overlays, not changed lines only |
| PR | Immutable GitHub base/head comparison and approved head content; no checkout, fetch, or local-worktree substitution |

PR helper limits include 200 paths, a 512-KiB patch, 128-KiB per head file, eight head files, and
2 MiB combined evidence. On partial evidence, report the limit and material unknowns rather than
claiming complete coverage. Read-only investigation must still honor privacy exclusions.

## Model evaluation and prompt iteration

Run `pnpm test:prompt` in CCR to print a read-only standalone review of the first source dimension.
For PowerShell clipboard output: `pnpm --silent test:prompt | Set-Clipboard`. Generation uses current
source, not stale `dist`, and calls no model. Paste into a fresh conversation in the target repository.
For all dimensions, use `dimension-prompts.md`. Neither experiment exercises skill continuity.

Edit shared discovery guidance in `src/review/impact-review-guidance.ts`, prompt structure in
`src/review/dimension-worker-prompt.ts`, and taxonomy in `src/review/dimensions.json`. Keep target
commit/changes fixed; record model, package version, prompt/skill, evidence scope, and outputs. Repeat
fresh sessions to expose variation. Keep expected outcomes out of the prompt supplied to the model.

Evaluate supported impact discovery, false positives, counterevidence, and honest uncertainty:

| Case | Expected contrast |
|---|---|
| Source agreement is the sole correctness rule | Find the learning/authority premise only with consequential-use evidence |
| Early low scores restrict future tasks | Examine self-reinforcing placement; reassessment narrows or removes the claim |
| Prior participation controls allocation | Check whether prior access becomes entitlement; relevant-purpose evidence can justify the rule |
| Required exam task blocks keyboard access | Identify access need, task, consequence, and evidence; an equivalent route changes the conclusion |
| A documented downstream appeal exists | Reject blanket “no recourse”; unknown downstream authority becomes a question |
| Dialect-sensitive answer rule | Distinguish subject knowledge from justified language assessment; invent no racial disparities |
| File allowlists, error statuses, upload races, or filename defects alone | No ethical finding without a supported human-impact mechanism |

Also assess source worldview, answerability replacing learning goals, undiscoverable unequal outcomes,
and one-way assessment authority when the target supports those hypotheses. Learners can be affected
without accounts. Missing records or a single stored answer do not prove unfair grading. Scenarios
must be logically possible and findings must not contradict unresolved questions.

One agent covers all selected criteria, checks counterevidence, and deduplicates findings. Reports
use `Context applied`, headings numbered from 1, horizontal rules between findings, severity,
dimension/criterion names, `Scenario`, and `Evidence`. Supported out-of-taxonomy ethical findings
stay in that list as `Other — outside current dimensions`. Check matching name links open the exact
Markdown reference section, not JSON; unmatched custom names stay unlinked. No trailing Question/
Context section or observations; uncertain claims stay unconfirmed in the journal. No authored
progress narration, coverage tables, file inventories, rejected candidates, or unsolicited fixes.
Host-rendered tool activity is separate. “No supported inclusivity bugs found.” is valid, not proof
of safety. Repeat with several findings, a mixture of mapped/unmapped findings, and no supported
findings; verify prior journal identities survive display renumbering.

## Continuity and freshness

After review, inspect the journal's scope, dimensions, evidence, counts, outcomes, and state/context
fingerprints. The summary placeholder must be gone. Confirm stable filenames, immutable `Started`,
advancing `Updated`, collision-safe same-day suffixes, and separate commit/PR identities.

1. Amend feedback and requested fixes in the same account; keep finding labels, rationale, checks,
   and next steps. Follow-up turns are not newly completed reviews.
2. Supply scoped human rationale for false positives. Capture it only when enabled and absent;
   bare disagreement asks for clarification. Re-review applies it while assumptions hold.
3. Continue a clean-tree review through edits/partial commit. Link the previous account without
   inheriting receipts. Session compaction/resumption reloads context and the active journal.
4. Put the active journal outside the recent count and current findings after long history. Both
   remain visible in bounded inputs; omissions are marked. Recency uses validated global activity,
   not filenames or branch identity. Valid legacy timestamps remain supported.
5. Change approved code or freshness context: the prior review becomes stale. Change only another
   journal or operational settings: freshness stays unchanged, but supplied-input hashes change.
   Test same-length journal edits with unchanged filesystem timestamps.
6. Change code/context during review: expected-state recording refuses it. Re-recording the review's
   own context edits requires unchanged code; old-branch/HEAD, PR, incomplete, malformed, oversized,
   placeholder, duplicate-metadata, or concurrently edited journals are refused. Only the latest
   review-run section receives state updates.
7. Assess local work and exact HEAD separately using matching `review-state`/`assess` arguments.
   Receipts are per branch, reject changed evidence, and do not imply review completion. Validity
   and populated readiness do not imply verified facts; arbitrary config edits are not assessments.
8. Explicit decision-maintenance requests preserve applicable rationale and superseded history.
   Ordinary project compaction never authorizes rewriting decisions.

## Hooks and automatic updates

Run `/ccr-hooks sync` and `status` in a disposable target. Default hooks must stay advisory, invoke
no model, leave source unstaged, and print the manual update prompt for incomplete commit context.
Failed updates remain retryable. Missing, malformed, oversized, NUL-containing, or invalid UTF-8
configuration fails visibly rather than silently disabling checks.

For automation, use authenticated Claude Code and explicitly enable `hooks.autoUpdateContext`.
Create additions, a deletion/rename, and binary/excluded files. Check:

- Exact 40/64-hex current HEAD, first-parent diffs, literal paths, approved modes, and explicit
  omission markers. HEAD/policy changes stop the operation-local reader.
- At most 200 approved paths, 200,000 retained characters, and 512,000 final packet bytes.
- Only restricted `Read`/`Edit`; reads are approved CCR inputs/packet, writes exact journal/project
  plus one enabled normalized nonduplicate decision supported by recorded human rationale.
- No source, config, stakeholder, other-journal, unauthorized ignored-path, Git, hook/settings,
  shell, search, task, MCP, or session-persistence access.
- Journal identity and structure validate; CCR advances `Updated`. Completion is recorded only
  after unchanged HEAD, valid context, and no unauthorized edits. No staging/commits/pushes.
- Successful work is not rerun even after state pruning. Failures remain non-blocking/retryable,
  disclose no raw upstream content, and print the manual fallback.
- Packet cleanup is attempted on normal success/failure. Tampering, lock contention, or abrupt
  termination fails closed and may leave an ignored packet for manual removal.

Race checks must produce one active run, preserve live locks regardless of duration, safely reclaim
dead owners/old empty containers, and never let stale observers or releases displace replacement
owners. Ambiguous containers remain untouched.

## Lifecycle races and cleanup

Overlap setup, update, config mutation, automatic work, journal creation, and uninstall. Conditional
writes must preserve changed-after-preview files. A journal created while uninstall waits must remain
ignored. Rerun interrupted partial operations safely. Native hook restoration preserves original
bytes; unknown/invalid framework provenance blocks ownership claims.

Automated fixtures cover deterministic cases. Still test real SHA-256 repositories, submodules,
detached HEAD, process/platform races, live integrations, and model behavior manually when relevant.

Remove hooks with `/ccr-hooks remove`, then preview/apply `ccr uninstall`. Ordinary removal preserves
shared context and local continuity; `--remove-context` removes shared context only. Unrelated files
and human edits must survive. Delete disposable clones/tarballs only when their evidence is no longer
needed. See [USER_MANUAL.md](USER_MANUAL.md) for ownership and troubleshooting.
