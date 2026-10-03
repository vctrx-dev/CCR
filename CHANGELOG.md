# Changelog

User-visible changes and migrations. Before 1.0, incompatible changes increment MINOR.
See [VERSIONING.md](VERSIONING.md); published release history is retained below.

## Unreleased

## 0.11.0 - 2026-10-02 (beta-0.2)

### Added

- Editable `.ccr/dimensions.json`, the `@vctrx/ccr/dimensions.json` export, and
  `context dimensions [--json]`. Reviews reload local taxonomy without changing surrounding guidance
  or reporting. Update refreshes untouched defaults, preserves customization, and tracks taxonomy
  in review freshness. Uninstall preserves it unless shared-context removal is explicit.

### Fixed

- Literal Git filenames prevent approved wildcard-like paths from exposing excluded diffs. Merge
  evidence/reminders use the first parent; PR approval and net diffs share one immutable comparison.
- Lock reclamation protects replacement owners; live locks do not expire with duration. Config errors
  omit input excerpts, and upgrades/unrelated edits preserve privacy exclusions.
- Input-context hashes include every supplied recent journal and the active entry. Freshness ignores
  journal activity and operational settings but still tracks code and shared review context. Existing
  review records become stale once after this change.
- `save-review --expected-state/--expected-context` refuses inputs changed during review;
  `record-review-state` refuses changed code while permitting the review's own context updates.
- Context assessments are branch-specific. `review-state` and `assess` accept `--commit` for exact
  current HEAD; older receipts are not reused, so assess once again.
- Journal previews/continuation retain current findings, human explanations, and next steps. Context
  validation accepts ordinary words such as "all" and "never" without treating them as unsupported claims.
- Updated the development-tool URI parser override and test runner to patched versions.

### Changed

- Review reports use headings numbered from 1 and horizontal separators, omit trailing questions/
  observations, and include supported out-of-taxonomy ethical issues as `Other` in the same list.
  Matching dimension/criterion names link to a JSON-generated Markdown reference installed by
  setup/update and shipped at `dist/review/dimensions.md`; custom unmatched names remain unlinked.
  Refresh installed skills with `ccr update`. Criteria and discovery standards are unchanged.
- Bounded worktree-hash batches and operation-local commit approvals reduce repeated work without
  caching permission across operations.
- Context assessment/readiness is separate from completed reviews; arbitrary file edits are not
  assessments. Local reviews record an assessment to avoid duplicate pre-commit reminders.
- Session follow-ups maintain stable finding labels, reasons, verification, and minimal supporting
  references without claiming fresh review. New work carries history but not old completion receipts.
- Decisions capture missing reusable human rationale. New setups enable `updateDecisionsMd`;
  existing values are preserved and absent older keys stay off. Explicit human maintenance may
  reconcile superseded rules while preserving their rationale.
- `context journals` excludes the active entry, which is always read separately; the PR token selects
  that active entry, not a PR-only history. The post-commit fallback is `/ccr-context update last commit`.
- Automation announces itself, supplies file diffs/content, and lets CCR set `Updated` after validation.
- Reports open with `Context applied`. Skills respect privacy, propose rather than apply
  stakeholder edits, and retain the reviewed PR head. Run `ccr update` after package upgrades.
- Removed confirmed unused private helpers/imports. Typecheck rejects unused source locals/parameters;
  public APIs and test-only safety helpers remain intact. Docs now separate quick start, reference,
  tests, and contributor rules without repeated walkthroughs.

## 0.10.1 - 2026-09-28 (beta-0.2)

### Changed

- Simplified dimension summaries and clarified that numbered review items are criteria rather than
  questions in generated prompts and the standalone review prompt. Run setup to refresh installed prompts.

## 0.10.0 - 2026-09-28 (beta-0.1)

### Added

- `ccr context save-review <scope> <dimensions> <critical,high,medium,low> <summary>` saves a
  finished review to its journal and records the reviewed state in one step.
- Source-checkout `test:prompt` command prints the first dimension's standalone review prompt from
  the same worker instructions used by the skill, enabling manual prompt experiments.

### Removed

- Setup no longer removes obsolete files from older CCR versions (`.ccr/index.md`, the
  `ccr-codebase` skill, and old per-skill `dimensions.md` copies). Delete them manually if present.
  `RETIRED_MANAGED_ARTIFACTS` and `RetiredManagedArtifact` are no longer exported.

### Changed

- Context initialization now asks project and stakeholder clarification questions in the same chat
  before finalizing the files. Answers become context prose; question-list scaffolds are removed,
  and explicitly unknown or skipped facts remain plain-language limitations.

- Replaced the review taxonomy with the seven dimensions and 28 criteria from `CCR_v5_7_review.xlsx`,
  retaining workbook wording, illustrative indicators, and boundaries. Criterion IDs exactly match
  the workbook and remain metadata, omitted from prompts. Dimension selectors now follow the full
  workbook names rather than old shorthand labels. `data-system-reliability` and `human-control-review` replace the retired
  `fairness-evaluation` and `system-integrity` selectors; group fairness evaluation is now part of
  `fairness-non-discrimination`. Reinstall and run setup to refresh installed prompts.
- Aligned review exclusions with the updated criteria: failure recovery and privacy protection can
  qualify with concrete human consequences, and unequal participation barriers can qualify even
  when someone eventually completes the task. Contextual language review includes internal code,
  prompts, comments, and documentation as well as interfaces.
- Review workers, prompt previews, and final skill reports now share one short prompt and a
  `Finding` / `Scenario` / `Evidence` and `Question` / `Context` output format; material uncertainties
  are reported as questions and "No supported inclusivity bugs found." is a valid result.
- `/ccr-review` now uses a single agent to review every selected dimension with the
  shared guidance embedded in the skill, verify results, record the journal, and report. The
  installed dimensions reference now shows the same prompts for people instead of JSON.
- Review discovery now tests hidden assumptions in correctly functioning product rules using concrete
  counterexamples, counterevidence, and feedback loops. Workers receive the shared method explicitly;
  material evidence gaps are reported as open questions rather than confirmed bugs or clean criteria.

### Fixed

- Pinned the transitive `js-yaml` dependency to patched version `4.3.2` to address a high-severity
  denial-of-service advisory in the development toolchain.

## 0.9.2 - 2026-09-02

### Changed

- Reoriented `/ccr-review` toward socio-technical, stakeholder-impact findings. Review workers now
  examine product assumptions, power, consequential decisions, feedback loops, and longer-term
  outcomes rather than reporting ordinary implementation, security, or interface defects by
  default.
- Findings now explain affected people, product behavior, harm pathway, grounded evidence, and a
  realistic case so reviewers can distinguish behavioral product risks from generic code defects.
- Updated the packaged review taxonomy and user documentation with examples of the intended
  stakeholder-centered review lens.
- Package smoke testing now inspects a locally packed artifact, so release verification remains
  reliable after a version has already been published to npm.

### Fixed

- Made package-smoke configuration-manual validation line-ending independent, so Windows release
  verification accepts the same packed artifact as other platforms.
- Updated the transitive `fast-uri` dependency to its patched release for URI parsing advisories.

## 0.8.1 - 2026-08-28

### Changed

- Release tags now publish from verified `main` commits through GitHub Actions and npm trusted
  publishing, with no long-lived npm token and automatic provenance.

### Fixed

- Published CLI metadata now uses npm's portable relative `bin` target so global installs and
  `npm exec` retain the `ccr` executable mapping.
- Concurrent decision updates now serialize through a repository-contained lock, preserving every
  distinct append under load while treating transient Windows lock races as contention.

## 0.8.0 - 2026-08-27

### Changed

- `context.recentJournalEntries` now means the repository-wide most recently active journals:
  CCR validates `Updated` metadata across branch and pull-request directories, sorts by activity,
  and applies the configured count only after that global ordering. Journal identity metadata do not
  influence selection; equal `Updated` values use `Started` newest-first and stable repository path
  as deterministic ties. One valid legacy `Timestamp` remains the fallback activity value until that
  entry is reused and migrated.
- Review state now separates the complete input-context fingerprint from the continuity-context
  fingerprint. Active journal edits are detected when that journal was supplied to the reviewer,
  while CCR's own continuity write remains excluded from the value it records. The legacy
  `ccr context journals PR-<number>` form remains accepted but no longer scopes the global result.
- Refactored managed paths, locks, conditional writes, configuration persistence, journal and
  decision document policy, Git inventory/process access, automatic-update execution, and review
  state into focused reusable boundaries with stable façades. CLI output/repository helpers and
  temporary Git test fixtures now have shared extension points for contributor handoff.
- Changes and codebase reviews now fingerprint the privacy-approved code state and bounded shared
  context—including prior recent journals—separately, verify both again before reporting, and record
  both in the latest structurally
  complete review run. Recording rejects placeholder, malformed, stale-branch, stale-HEAD, PR,
  oversized, and concurrently changed journals. PR review also rechecks shared context alongside its
  immutable refs. Advisory pre-commit and post-commit checks warn when later human edits make a review
  stale; post-commit marks the recorded status stale without blocking Git.
- Journal filenames now use a stable UTC creation date with numeric same-day suffixes. New entries
  record immutable `Started` and monotonic `Updated` timestamps; reuse, review follow-up, and commit
  finalization refresh `Updated` without renaming the journal, and legacy `Timestamp` headers migrate
  in place.
- The first `/ccr-context initialize` now replaces only the generated `domain: "unspecified"` default
  with one concise, evidence-backed product-domain label (or `general-software` if no specific
  classification is supported). A conditional CLI updater protects any human-set domain from being
  overwritten on initial or later runs.
- Added the default-off `hooks.autoUpdateContext` setting. When enabled, CCR assembles a bounded,
  privacy-filtered exact-HEAD evidence packet under ignored `.ccr/private/`; headless Claude can read
  only approved `.ccr` inputs and edit only the exact journal, project context, and opt-in decision
  file. It receives no shell, raw repository-read, task, hook, settings, MCP, Git-mutation, or saved
  session access.
  Temporary evidence is conditionally removed after normal outcomes and fails closed if it was
  changed or cannot be locked; 40- and 64-hex Git object IDs are supported, completion requires
  strict journal/context structure and unchanged `HEAD`, opted-in decisions remain append-only, and
  token-owned locks and bounded state recover safely without exposing upstream errors.
- Hook commands now fail visibly for missing or invalid configuration. Incomplete code-plus-context
  journals remain retryable after automatic failure, successful warning output remains visible, and
  post-commit fallback text stays event-specific and non-blocking.
- Repository and review evidence now streams Git blobs and diffs into fixed bounds before retention,
  emits explicit binary/truncation/deletion markers, rejects live overlays above 5,000 paths, and
  exposes paginated privacy-approved evidence for only the exact immutable current commit. Additions,
  deletions, renames, binary files, excluded paths, symlinks, and submodules have deterministic cases.
- Applied setup, update, configuration, automatic-context, and uninstall writers now share one
  token-owned lifecycle lock. Config and journal allocation preserve concurrent changes, semantic
  journal ensures converge, and setup/uninstall use exact-content compare-and-swap writes and
  conditional deletes. Uninstall and journal mutation share a second barrier so a journal created
  after preview cannot become unignored. Cooperating writers serialize, changed-after-preview content
  observed before mutation is preserved, and interrupted multi-file work can be rerun idempotently.
- Review reporting now waits for continuity-journal completion. Working journals remain reusable
  after their 4,000-character evidence preview is truncated, up to a separate 64,000-character
  managed-file safety bound.
- Expanded the review taxonomy with deeper domain criteria and a new `system-integrity` dimension
  covering execution, state lifecycle, concurrency, authentication, unsafe inputs, resource
  exhaustion, failure handling, and cross-layer contract defects. Review workers now test explicit
  cross-file failure hypotheses and use concrete examples while the master deduplicates overlapping
  domain and system findings.
- Prompt prose and data-only taxonomy content no longer use wording, snapshot, or hard-coded registry
  tests. The audit blast-radius rule skips prompt-only changes while executable parsing,
  installation, CLI behavior, and package integrity remain covered.
- Removed empty placeholder directories, unused test helpers, and fixture commands whose backing
  scripts were never implemented. Contributor guidance now points to the active source structure.

## 0.7.0 - 2026-08-25

### Changed

- Added `ccr update [--apply]`, a preview-first package-upgrade path that refreshes only
  package-managed CCR assets while preserving configuration, shared context, journals, private
  state, and user-owned files.
- Setup now creates an empty, human-owned `.ccr/decisions.md`. Reviews read it as advisory context
  and may append one concise, human-confirmed decision only after the new
  `instructions.updateDecisionsMd` opt-in is enabled; the default remains `false`.
- Every review now preloads all three shared context documents and the configured recent journals.
  Commits and PRs reuse one local journal entry, same-review human feedback amends that entry,
  completed reviews replace its summary placeholder with factual scope/evidence/outcome context,
  project context changes only for durable high-level updates, and stakeholder context becomes
  human-owned after initialization.
- Advisory hook handlers are now named `ccr hooks pre-commit` and `ccr hooks post-commit` to match
  their Git events; the former names remain hidden compatibility aliases for existing integrations.
- Hook provenance now has one deterministic validated schema. Invalid state blocks ownership and
  cleanup claims, while existing markers without state remain legacy/unprovenanced and cannot be
  adopted by inferring their original bytes or history.
- Root CLI help now distinguishes terminal commands from Claude Code skills, shows their arguments,
  and derives the displayed review-dimension IDs from the validated registry.
- The `/ccr` support skill now answers questions about that help surface from current installed CLI,
  skill, dimension, and configuration sources without performing mutations.
- `.ccr/project.md` no longer has an operating character limit. Validation inspects at most 10,000
  UTF-16 characters and rejects longer documents, while evidence reads visibly mark truncation.
- `.ccr/index.md` is no longer created, validated, read, or accepted as review context. Setup removes
  the exact obsolete generated template during upgrades while preserving human-edited versions.
- Journal entries are titled `CCR Journal` and no longer duplicate changed paths. Working entries
  omit Branch and Commit until the post-commit hook can attach a real commit identity.
- Review dimensions are rendered once at `.claude/skills/ccr/references/dimensions.md`; `/ccr`,
  and `/ccr-review` share that generated taxonomy instead of installing copies.
- `/ccr-review` now handles changes by default, complete-codebase reviews, and read-only `PR-<number>`
  reviews; setup retires the former `/ccr-codebase` skill.
- PR reviews now enforce bounded metadata, changed-path, patch, head-file, and combined-evidence
  limits plus configured privacy exclusions through deterministic CLI evidence boundaries before
  dispatching dimension workers.

## 0.5.0 - 2026-08-12

### Added

- Data-driven `/ccr-review` supports all, multiple, or individual review dimensions without coupling
  dimension changes to setup or orchestration code.
- A validated review-dimension registry, initial correctness/privacy/stakeholder-safety guidance,
  and package-managed progressive-disclosure references.
- Privacy-filtered staged, unstaged, and untracked review evidence commands.
- Review continuity reuses one branch-local journal entry per commit and supports repeated run
  sections without creating additional commit entries.

### Changed

- Shared-context validation now accepts cited line ranges and web-route literals while continuing to
  reject missing repository paths and unsupported absolute claims.
- Review findings require plain column-aligned fields, top-level dimension IDs, and no remediation
  suggestions before the user approves source changes.
- Reviews now read the current shared narrative context, including uncommitted human edits, through
  a path-bounded command; review dimension relationships reject duplicates and self-references.
- Context discovery budgets are now adaptive starting guidance: Claude may expand a plan to close a
  named material evidence gap, while every operation uses a tool-free evidence-packet verifier and
  an explicit evidence-completeness stopping rule.
- Legacy hook cleanup now shares the byte-preserving managed-block parser, validates both hooks
  before writing, and reports malformed, unsafe, or unavailable hook state distinctly.
- ASU provider settings and cost estimates use one strict validation boundary; non-retryable HTTP
  client errors now fail after one request.
- Mandatory privacy exclusions have one runtime source of truth instead of overlapping config
  defaults.

### Removed

- The premature GitHub Action manifest and provider-only entry point, which advertised review
  behavior that is still on the roadmap.

## 0.4.0 - 2026-08-11

### Added

- `/ccr-context` with five operations: initialize, update, verify, addition, and compact.
- A separate `/ccr` manual and privacy-filtered recent-commit verification paths.
- Human-readable config help for every setting and a bounded compaction percentage.
- A repository-aware `/ccr-hooks` skill chooses an existing hook framework, configured hook path,
  current interpreter, or minimal direct Git hook instead of setup hardcoding one strategy.
- A post-commit hook starts a branch-local journal entry, warns when a commit changed code without
  updating shared context, and prints a copy-paste prompt that drives `/ccr-context`.

### Changed

- Configuration schema v2 makes settings human-owned and reads supported v1 values without
  rewriting their file.
- Context discovery can incorporate explicitly supplied plans or specifications as future intent.
- Operation-scoped agent budgets keep focused context repairs bounded while preserving
  large-repository parallel discovery.
- Hook provenance verifies exact native-file restoration with original length/hash and managed
  separator metadata; framework probes are local and bounded.
- Context verification rejects shortened file citations and aggregate workflow summaries that omit
  trigger or role exceptions.
- Focused verifiers consume a bounded draft/evidence packet without tools, preventing a second
  repository-wide search during small repairs.
- Semantic compaction has a separate eight-minute budget instead of inheriting the shorter focused
  update budget.
- Human-supplied additions no longer turn an omitted implementation claim into an unsupported
  repository-absence claim.
- Context drafts remain in memory; operation-created temporary files are restricted to `.ccr/tmp/`
  and removed before completion.
- Setup and uninstall share exact-line, byte-preserving managed-block plans and reject stale,
  malformed, duplicate, or ambiguous ownership before writing.
- Hook status supports linked worktrees and reports external configured paths without blocking setup.
  Provenance-managed framework hooks must be removed through `/ccr-hooks`, preventing false CLI
  removal claims.
- CLI version now derives from the package version and is verified after packed installation.
- Product wording, privacy defaults, and context examples are programming-language and domain
  neutral.
- A failed affected-test process now fails the blast-radius quality gate instead of being converted
  to empty output.

### Removed

- Provider policy and configurable character-limit settings.
- The unused fixed discovery-agent setting and empty source scaffold modules.

## 0.2.0 - 2026-07-29

### Added

- One-package, opt-in component guidance.

### Changed

- Consolidated technical structure, data, integrations, and verification into `project.md`.

### Removed

- Separate architecture, decisions, and risks context pages. Technical details now live in the
  concise project context.

## 0.1.1 - 2026-07-29

- Used a unique local package version to avoid package-manager reuse of the first test artifact.
- Stopped context initialization on CLI/config schema mismatch instead of editing configuration.

## 0.1.0 - 2026-07-29

- Initial repository context CLI and Claude Code skill.
- Preview-first setup, validation, status, configuration, and safe uninstall.
- Filtered Git-index evidence broker and privacy exclusions.
- Branch-local journals and optional advisory pre-commit warning.
- Parallel discovery with an independent bounded verification pass.
- Packed-artifact installation smoke test and repository quality gates.

This local development package was not published to npm.
