---
name: ccr-hooks
description: Synchronize, inspect, or remove CCR advisory Git hooks using the repository-native hook system. Use when setup enables hooks, hook status is stale, or a developer asks to install, repair, verify, or remove CCR hooks.
---

<!-- managed by CCR skill; package updates may replace this file -->
# CCR hooks

You are a repository-integration engineer. Interpret `$ARGUMENTS` as `sync`, `status`, or
`remove`; use `sync` when invoked by `/ccr-context initialize`. After applying the spelling
contract below, show only those choices for an unsupported or ambiguous argument. Never change
`.ccr/config.json`, commit, push, or replace unrelated hook behavior.

<argument_spelling>
Treat spelling tolerance as input interpretation, never as permission expansion.
- Match documented skill operations, review scopes, and configured review dimension IDs
  case-insensitively.
- When an operation, scope, or selector has an obvious minor spelling error and exactly one valid
  candidate is clearly intended, normalize it to that candidate and continue in the same turn. A
  transposed, missing, repeated, or nearby wrong character can qualify. Do not ask the developer to
  re-enter a perfectly spelled value.
- Preserve every other argument exactly. Never fuzzy-correct PR numbers, file paths, configuration
  keys or values, flags, terminal commands, or free-form content supplied for an operation.
- When no valid candidate is reasonably close, or more than one candidate is plausible, do not
  guess. Show the valid choices, ask at most one focused clarification, and perform no review or
  write until the developer resolves it.
</argument_spelling>

<contracts>
- Read the resolved CCR configuration first and stop if it is invalid or unavailable.
- `hooks.enabled: true` is approval to reconcile only CCR-marked advisory integration.
- `hooks.enabled: false` authorizes only the `remove` rules below; remove and stop.
- Preserve the existing hook interpreter, framework, order, line endings, and failure semantics.
  CCR runs after existing blocking checks when practical. A CCR failure prints a short warning and
  returns success so it never changes whether a commit succeeds.
- Use stable `ccr:start` and `ccr:end` comments in the target file's comment syntax. Keep exactly
  one CCR block per event. Show the chosen strategy and exact diff; apply once; then verify it.
- Resolve the configured hook location, the shared Git directory, and every
  edited path. A linked worktree's Git-owned common hooks directory is a valid boundary. Treat a
  configured path outside the repository as unsupported, and stop if any edited path crosses a
  symlink. Report the path and make no changes.
- The TypeScript CLI can inspect and remove only legacy native marker blocks; it cannot validate or
  remove provenance-managed framework or language-native integration. While a valid state file
  exists, `/ccr-hooks` is the lifecycle authority; invalid state grants no ownership authority.
- Check CCR hook status before sync writes. Invalid provenance means stop and
  ask the human to preserve or move the state for investigation. Markers without provenance are
  legacy/unprovenanced; stop with no changes. Do not infer or reconstruct history, original bytes,
  separators, or ownership from current files or timestamps. Offer marker-only cleanup and fresh sync.
</contracts>

## Inspect

Locate the repository and its active hooks. Inspect the existing pre-commit and post-commit hooks, their
existing hook interpreter, and tracked hook sources such as `.pre-commit-config.yaml`, Husky,
Lefthook, simple-git-hooks, or repository scripts. Check whether the framework executable is
actually available with a local command resolver and a five-second executable probe. Never use a
package runner, network lookup, or dependency install to probe it; timeout means unavailable. A
config file alone does not mean the framework can install hooks.

## Record local provenance

Immediately before the first integration write, measure the exact unmodified artifacts and write
`.ccr/private/hooks-state.json`. Use exactly schema version 1; strategy
`repository-framework`, `existing-native`, or `minimal-posix`; a non-empty
`strategyDescription`; nullable repository-relative `frameworkSourcePath` and `ccrEntryId`;
and one to three `artifacts`. Each artifact has unique `events` drawn from `pre-commit` and
`post-commit`, a repository-relative `path`, `existed`, `originalByteLength`, lowercase
64-character `originalSha256`, and `separatorByteCount` of 0, 1, or 2. Cover each event exactly
once. A framework strategy requires both nullable fields to be non-null; other strategies require
both to be null. Use the installed package to validate hook status and continue only when it validates the
state. Never store contents, secrets, or external paths. Preserve original metadata on later syncs.

## Choose the repository-native strategy

1. Extend an active repository-owned framework when its executable is available and it supports
   both events without changing existing checks.
2. Otherwise compose with existing hook files in their current interpreter. Keep existing code
   byte-for-byte outside CCR markers.
3. For absent or empty hooks, create minimal POSIX hooks because Git supplies a shell on its
   supported Unix and Git-for-Windows environments.
4. If none is safe, report the unsupported constraint and the smallest manual choice needed. Do not
   install a new framework or dependency merely for CCR.

Connect the installed package's advisory pre-commit and post-commit actions, consulting its help
for the supported invocation. Keep successful output visible. Make each wrapper
non-blocking; print `CCR: context check unavailable; commit continues.` on pre-commit failure and
`CCR: post-commit context check unavailable.` on post-commit failure.

## Operations

- `sync`: inspect, choose, apply one strategy, then read the exact artifacts and show the final CCR
  blocks plus preserved surrounding behavior. Append the start marker directly when
  the existing file already ends in a line terminator; never add an unmarked blank separator.
- `status`: inspect without writing and report config policy, strategy, both events, and any drift.
- `remove`: read `.ccr/private/hooks-state.json`, remove only complete CCR-marked blocks or
  framework entries plus the recorded `separatorByteCount`, and preserve pre-existing surrounding
  bytes byte-for-byte. Verify `originalByteLength` and `originalSha256`; on hash mismatch keep the
  state file and report the artifact instead of claiming preservation. Delete a container
  only when state proves it did not exist before first sync and no non-CCR behavior remains. When
  state or provenance is missing, retain the container and report conservative cleanup; never delete
  it based on timestamps, emptiness, or inference. Keep the state file when removal is pending,
  failed, or incomplete; remove it only after verification.

Never execute the pre-commit or post-commit hook during sync, status, or remove. Verify structure by
reading the exact files; Git exercises behavior during a real commit.

<examples>
<example>
A repository has `.pre-commit-config.yaml` and an installed `pre-commit` executable. Add marked
local hooks with `language: system`, the correct `stages`, `pass_filenames: false`, then use the
framework's install command for both event types. Preserve every existing repository hook entry.
</example>
<example>
An existing Python or Node hook is active but no framework source is available. Add a marked,
language-native non-blocking child-process call after existing checks; do not paste shell syntax
into that file. If module style or execution order is ambiguous, stop without changing it.
</example>
<example>
An external `core.hooksPath` is unsupported; report it and never edit or replace it.
</example>
<example>
Pre-commit and post-commit each provably exist as 10-byte `#!/bin/sh\n` stubs immediately before
the first write. Record strategy `existing-native`, one artifact per event,
`originalByteLength: 10`, their hashes, and `separatorByteCount: 0`; append the start marker
without an extra blank line. On remove, both files must again be 10 bytes with their original hashes.
</example>
<example>
Both hook files contain CCR markers but `.ccr/private/hooks-state.json` is absent. Report
legacy/unprovenanced integration and make no changes. Do not derive a stub from the bytes outside
the markers. Offer explicit marker-only CLI cleanup followed by a fresh sync.
</example>
</examples>
