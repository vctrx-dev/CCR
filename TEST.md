# Test CCR in a Real Repository

This runbook validates the packaged CCR developer workflow in a disposable or recoverable target
repository. It covers managed context reads and writes, all review scopes, freshness recording,
advisory and automatic hooks, concurrency, privacy, bounded evidence, and cleanup.

> Run commits, malformed-state cases, races, and artificial defects only in a disposable clone.
> Back up existing `.ccr/`, `.claude/skills/`, instruction files, and hook configuration first.

## 1. Build and install the package

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
npx --no-install ccr --version
```

The version must match `package.json` in CCR.

## 2. Validate setup, update, and uninstall boundaries

Preview before every managed lifecycle operation:

```powershell
npx --no-install ccr config init
npx --no-install ccr config init --apply
npx --no-install ccr setup
npx --no-install ccr setup --apply
npx --no-install ccr setup --apply
npx --no-install ccr context validate
```

The repeated apply must be idempotent. Existing human-owned configuration, project, stakeholder,
decision, journal, private, and unrelated instruction content must remain intact. After upgrading the
package, run `ccr update` before `ccr update --apply`; only package-managed assets and marked blocks
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

Confirm these ownership rules:

- `project.md` contains durable, evidence-backed repository context.
- `stakeholders.md` is populated during initialization and read-only to later automatic operations.
- `decisions.md` remains human-owned and changes only through the explicit configuration opt-in.
- local journals are branch- or PR-specific and remain under ignored `.ccr/journal/`.
- secrets, mandatory excluded paths, symlinks, submodules, and private worktree content never appear
  in broker output or shared context.

Exercise the read-only broker from the terminal:

```powershell
npx --no-install ccr context files
npx --no-install ccr context recent
npx --no-install ccr context shared .ccr/project.md
npx --no-install ccr context journals
```

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

Also try unknown scopes, `PR-0`, duplicate IDs, empty comma items, `all` mixed with IDs, an unknown
ID, and a third positional argument. Each invalid request must stop before worker dispatch or journal
writes and show the valid scopes and installed IDs.

Every non-empty review creates exactly one worker per selected dimension. Each worker must assess
every criterion in that dimension, test concrete success/failure/retry/concurrency/replacement/
cleanup hypotheses where applicable, and return bounded evidence. The master deduplicates root
causes and verifies candidates before reporting.

## 5. Validate every review scope

For `changes`, create staged, unstaged, untracked, deleted, binary, and privacy-excluded cases. The
review may use only the broker-approved live overlay and must not inspect excluded content.

For `codebase`, run:

```text
/ccr-review codebase all
```

It must page through the safe Git index, trace complete behaviors, and overlay current approved live
changes. It must not fall back to a changed-lines-only review.

For a disposable pull request, run `/ccr-review PR-<number> all`. It must use immutable GitHub
base/head evidence without checkout, fetch, branch mutation, or local-worktree substitution. A PR
over any metadata, 200-path, 512-KiB patch, 128-KiB per-head-file, eight-head-file, or 2-MiB combined
limit must stop with an evidence blocker before workers run.

Every confirmed finding has exactly these labels:

```text
Severity: Critical | High | Medium | Low
File: repository/relative/path
Issue: evidence-backed incorrect behavior
Case: concrete triggering condition
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
2. Change resolved config, project, stakeholder, decision, or a prior recent-journal context entry:
   freshness becomes stale even when code is unchanged. The active branch continuity target is
   excluded because its recorder validates that write separately.
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
npx --no-install ccr config set hooks.autoUpdateContext true --apply
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
npx --no-install ccr uninstall
npx --no-install ccr uninstall --apply
# Disposable repository only:
npx --no-install ccr uninstall --apply --remove-context
```

Confirm CCR removes only package-managed artifacts and marked blocks, preserves unrelated and
human-owned content by default, and rejects a supplied preview if any planned file changed. Remove
the packed tarball and disposable clone when their evidence is no longer needed.
