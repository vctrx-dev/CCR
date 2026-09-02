# Test CCR in a Real Repository

This runbook validates the packaged CCR developer workflow in a disposable or recoverable target
repository. It covers managed context reads and writes, all review scopes, freshness recording,
advisory and automatic hooks, concurrency, privacy, bounded evidence, and cleanup.

> Run commits, malformed-state cases, races, and artificial defects only in a disposable clone.
> Back up existing `.ccr/`, `.claude/skills/`, instruction files, and hook configuration first.

## 1. Install the package

For a published-release smoke test, install the exact registry version rather than a local folder or
tarball:

```powershell
cd D:\Code\your-test-repository
npm install --save-dev @vctrx/ccr@VERSION
npx --no-install ccr -v
npx --no-install ccr -version
npx --no-install ccr --version
```

For pre-release package validation, build and pack from the CCR repository:

From the CCR repository:

```powershell
cd D:\Code\ccr
pnpm build
$packageName = npm pack --silent
$packagePath = Join-Path (Get-Location) $packageName
```

In the disposable target repository:

```powershell
cd D:\Code\your-test-repository
npm install --save-dev $packagePath
npx --no-install ccr -v
npx --no-install ccr -version
npx --no-install ccr --version
```

The version must match `package.json` in CCR.

## 2. Validate setup, update, and uninstall boundaries

Preview before every managed lifecycle operation:

```powershell
npx --no-install ccr config init --dry-run
npx --no-install ccr config init
npx --no-install ccr setup --dry-run
npx --no-install ccr setup
npx --no-install ccr setup
npx --no-install ccr context validate
```

The repeated write must be idempotent. Existing human-owned configuration, project, stakeholder,
decision, journal, private, and unrelated instruction content must remain intact. After upgrading the
package, run `ccr update --dry-run` before `ccr update`; only package-managed assets and marked blocks
may change.

The automated lifecycle tests overlap setup, config initialization, config mutation, and uninstall
calls in one process. They require token-owned operation locks and per-file compare-and-swap or
conditional deletion, so a file changed after preview is never overwritten or removed. Use this
disposable-repository runbook for the CLI update route, interrupted multi-file operations,
process-level races, and platform-specific races.

The uninstall race fixture also starts from a preview with no local state, creates a journal while
apply is waiting, and requires both the journal and `.gitignore` continuity block to survive.

## 3. Validate context reads, writes, and privacy

Open Claude Code and run:

```text
/ccr-context initialize
/ccr-context verify
/ccr-context addition
/ccr-context update
```

Repeat representative operations with obvious unique spelling mistakes, such as
`/ccr-context initailize`, `/ccr-context verfiy`, `/ccr-hooks statsu`, and
`/ccr-review codbase privcy`. Each must normalize to the single intended installed choice and
continue without asking for corrected spelling. Then try an unrelated or ambiguous token; it must
show valid choices, ask at most one focused question, and make no review or repository write. Confirm
that PR numbers, paths, config keys and values, flags, terminal commands, and free-form addition text
are preserved exactly rather than fuzzy-corrected.

Confirm these ownership rules:

- `project.md` contains durable, evidence-backed product-to-people context: consequential behavior,
  rules, constraints, and uncertainty rather than a technical inventory. Confirm it starts with a
  plain-language purpose and uses a Mermaid diagram only when it clarifies a real product flow.
- `stakeholders.md` is populated during initialization and read-only to later automatic operations.
- `decisions.md` remains human-owned and changes only through the explicit configuration opt-in.
- local journals are branch- or PR-specific and remain under ignored `.ccr/journal/`.
- `ccr context journals` returns the configured repository-wide count ordered by validated
  `Updated`, even when an older filename from another branch or PR was amended most recently.
- a not-yet-migrated journal with one valid `Timestamp` uses that value for recency; activity-looking
  examples below `## Summary` do not affect ordering.
- secrets, mandatory excluded paths, symlinks, submodules, and private worktree content never appear
  in broker output or shared context.

Exercise the read-only broker from the terminal:

```powershell
npx --no-install ccr context files
npx --no-install ccr context recent
npx --no-install ccr context shared .ccr/project.md
npx --no-install ccr context journals
npx --no-install ccr context journals PR-123
```

The two journal commands must return the same global result; the optional PR token is accepted only
for v0.7 compatibility and never scopes recency.

When a listing reports `omittedCount`, continue with its exact `nextCursor`. Bounded text must carry
an explicit truncation marker. Binary, deleted, symlink, submodule, excluded, malformed UTF-8, and
oversized cases must fail closed or return their documented omission marker; they must never be
silently interpreted as empty text.

## 4. Validate review selection

The bundled dimensions are:

- `fairness-evaluation`
- `pedagogy`
- `decision-fairness`
- `inclusion`
- `transparency`
- `privacy`
- `system-integrity`

Run representative valid forms:

```text
/ccr-review
/ccr-review all
/ccr-review changes privacy
/ccr-review codebase system-integrity, privacy
/ccr-review PR-123 fairness-evaluation, privacy
```

Also try unrelated scopes and IDs that are not minor unique misspellings, `PR-0`, duplicate IDs,
empty comma items, `all` mixed with IDs, and a third positional argument. Each invalid request must
stop before worker dispatch or journal writes and show the valid scopes and installed IDs.

Every non-empty review creates exactly one worker per selected dimension. Each worker must assess
every criterion in that dimension, form concrete stakeholder-impact hypotheses, and use bounded
evidence to prove or reject them. A worker must not turn a routine implementation, security, or UI
defect into a finding merely by assigning it a dimension. The master deduplicates root causes and
verifies candidates before reporting.

### Qualitatively evaluate stakeholder-impact review

Use a target product and supplied context that support the relevant premise. The review should surface
or explicitly assess these product-level concerns when repository evidence supports them:

1. A source's worldview becomes assessment authority because uploaded material is treated as neutral
   ground truth without a way to identify perspective, contested claims, or omitted viewpoints.
2. Automated question generation optimizes for answerability rather than defensible learning because
   it never establishes a learning objective, reasoning level, or evidence of understanding.
3. Unequal outcomes can persist because responsible people have no feedback loop to discover patterns
   of confusion, misrepresentation, or disadvantage across learner contexts or cohorts.
4. Learners carry the whole burden of contesting consequential automated assessment because they have
   no route to understand, challenge, or correct an answer's authority.

For each supported positive case, expect a report that names affected roles and power relationship,
the relevant product assumption or decision, a credible harm pathway, repository evidence, and what
remains uncertain. The report should remain meaningful if every endpoint, screen, and job technically
works.

Use this negative control: a CSV-download filename sanitizer permits Windows reserved names such as
`CON.csv`. Unless the target evidence shows a specific product-level stakeholder harm, CCR must reject
it as a standalone technical/UI defect rather than relabel it as inclusion or system-integrity.

## 5. Validate every review scope

For `changes`, create staged, unstaged, untracked, deleted, binary, and privacy-excluded cases. The
review may use normal repository tools to understand the changed behavior and its surrounding flow,
but must not inspect excluded content.

For `codebase`, run:

```text
/ccr-review codebase all
```

It must page through the safe Git index, trace complete behaviors, and overlay current approved live
changes. It must not fall back to a changed-lines-only review.

For a disposable pull request, run `/ccr-review PR-<number> all`. It must establish immutable GitHub
base/head evidence without checkout, fetch, branch mutation, or local-worktree substitution. It may
use normal read-only GitHub and repository research to understand the PR's surrounding product flow.
A PR over any metadata, 200-path, 512-KiB patch, 128-KiB per-head-file, eight-head-file, or 2-MiB combined
limit should report the helper's bounded-packet condition; confirm the review can still use appropriate
read-only evidence rather than silently treating the partial packet as complete.

Every confirmed finding includes these qualities:

```text
Severity: Critical | High | Medium | Low
Affected people: roles and relevant power relationship
Product behavior: evidence-backed assumption, decision, or incentive
Harm pathway: why the behavior can negatively affect people
Evidence: repository/relative/path and supporting behavior
Case: realistic condition in which the impact occurs
Dimension: selected dimension ID or IDs
```

The review reports no fix or remediation and changes no source, tests, configuration, branches, or
worktrees. Only its bounded continuity writes are allowed.

## 6. Validate continuity and freshness

After a successful changes or codebase review, inspect its journal. The latest `## Review run` must
contain exactly one non-empty Scope, Dimensions, Evidence, Finding counts, and Outcomes record, plus:

```text
- **Reviewed state**: `sha256:...`
- **Reviewed context**: `sha256:...`
- **Review status**: current
```

The summary placeholder must be gone. `Started` remains immutable; `Updated` advances monotonically.
Same-day allocation uses numeric filename suffixes without collisions, repeated work on one semantic
state reuses one journal, and different commits or PRs stay isolated.

Then test each freshness transition:

1. Change approved code after review: pre-commit warns and post-commit marks the review stale.
2. Change resolved config, project, stakeholder, decision, any recent-journal input, or an existing
   active journal returned to the reviewer: the input-context fingerprint changes even when code is
   unchanged. The continuity fingerprint alone excludes the active target so CCR's own later write
   remains valid.
3. Change code or context during review: the skill reloads and restarts once.
4. Change it again during the restarted review: the skill stops as unstable.
5. Try recording a PR, older branch, older `HEAD`, placeholder, incomplete, malformed, duplicate-
   metadata, oversized, or concurrently edited journal: recording must fail without overwriting it.
6. Add a second review-run section: only the latest section is recorded or marked stale.

## 7. Validate advisory hooks

In Claude Code:

```text
/ccr-hooks sync
/ccr-hooks status
```

With `hooks.autoUpdateContext: false`, create a harmless commit and confirm:

- pre-commit and post-commit remain advisory;
- no hook invokes an LLM, rewrites or stages files, retries Git, or blocks for stale context;
- a missing/incomplete commit journal prints the correct manual update prompt;
- a failed prior update remains retryable on the next post-commit invocation;
- missing or malformed `.ccr/config.json` fails visibly instead of disabling hooks silently.

Also try an oversized, NUL-containing, and malformed-UTF-8 shared and local configuration file. Each
must fail visibly before parsing or retaining the complete file. Restore valid configuration before
continuing.

## 8. Validate automatic post-commit context

This section requires an installed and authenticated Claude Code CLI:

```powershell
npx --no-install ccr config set hooks.autoUpdateContext true
```

Create a disposable commit containing additions, a deletion or rename, and a binary file. Confirm:

- CCR binds evidence to the exact lowercase 40- or 64-hex current `HEAD` and stops if `HEAD` moves;
- excluded paths and unsafe Git modes do not enter the evidence packet;
- additions, both sides of renames, deletions, truncation, and binary markers remain explicit;
- packet construction stops above 200 approved paths, 200,000 retained characters, or a 512,000-byte
  final JSON packet;
- the temporary bounded packet exists only under ignored `.ccr/private/` and is removed after normal
  success and failure; packet tampering, an unavailable cleanup lock, or abrupt termination must fail
  closed and can leave an ignored packet for manual removal;
- headless Claude has only `Read` and `Edit`, reads only approved `.ccr` inputs, and has no shell,
  task, glob, grep, MCP, settings, hook, raw-source, Git, or session-persistence capability;
- writes can reach only the exact journal and `.ccr/project.md`, plus at most one normalized,
  nonduplicate decision append when the opt-in is true; replacement, deletion, multiple/multiline,
  padded, blank, malformed, duplicate, or oversized decision edits fail closed; `config.json`,
  `stakeholders.md`, other journals, private state, source, ignored
  outside files, and untracked directories remain unchanged;
- a successful journal preserves `Started`, advances a valid UTC `Updated`, matches the exact commit,
  contains a real summary, and retains all four outcome categories;
- automation leaves changes unstaged, creates no commit, records bounded idempotency state only after
  validation, and does not rerun an already-complete journal even after old state entries are pruned;
- failure exposes no raw provider response, remains non-blocking, attempts conditional temporary
  evidence cleanup, and prints the manual fallback.

Concurrent invocations must produce one active run. A recent incomplete lock stays owned; a dead,
expired, or legacy stale lock is reclaimed atomically; releasing an old owner must never remove a
replacement owner's lock.

## 9. Run automated edge and package gates

From CCR:

```powershell
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test:coverage
pnpm verify
pnpm test:changed:print
```

The automated regression suite covers empty and malformed inputs, accepted 40/64-hex object IDs,
binary and invalid UTF-8 boundaries, oversized blobs/diffs/path inventories/state, privacy
exclusions, deletions, renames, symlinks, unborn/stale `HEAD`, retry and duplicate execution,
same-process races, stale locks, compare-and-swap conflicts, multiple review sections, and cleanup
after success and failure. The manual sections above remain required for real SHA-256 repositories,
submodule fixtures, detached-HEAD workflows, process-level/platform-specific races, live Claude and
GitHub integrations, and model behavior across every review scope. Do not weaken a gate or coverage
threshold.

For contributor refactors, test through the stable façade first, then add a focused test beside a new
policy boundary when its behavior is independently meaningful. Reuse
`createTemporaryGitRepository` and `createTemporaryRootRegistry` from
`tests/helpers/test-environment.ts` instead of repeating temporary-directory initialization and
cleanup. A structural extraction is complete only when the original façade tests, `pnpm run audit`,
type checking, coverage, build, and package smoke all remain green.

## 10. Cleanup

Remove hook integration first:

```text
/ccr-hooks remove
/ccr-hooks status
```

Then preview and apply uninstall:

```powershell
npx --no-install ccr uninstall --dry-run
npx --no-install ccr uninstall
# Disposable repository only:
npx --no-install ccr uninstall --remove-context
```

Confirm CCR removes only package-managed artifacts and marked blocks, preserves unrelated and
human-owned content by default, and rejects a supplied preview if any planned file changed. Remove
the packed tarball and disposable clone when their evidence is no longer needed.
