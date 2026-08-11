# CCR Real-Repository E2E Validation

This report tracks repeated packed-package tests against:

- `D:\Code\requesta-ccr-test` — mixed Python/Django and Next.js/React repository.
- `D:\Code\ladybird` — large C++/CMake repository.

No test branch may be pushed. Each target must be restored to its recorded starting commit and
working-tree state after every cycle. A result is accepted only when both its technical behavior
and Claude Code output are satisfactory.

## Starting baselines

| Repository | Starting branch | Starting commit | Starting worktree |
|---|---|---|---|
| CCR | `feat/auto-context-hooks` | `5bc7baf` | Nine pre-existing staged additions; preserve |
| requesta-ccr-test | `development` | `6596e7045761c53d40811d2ec9b99d06a8ef7ba2` | Clean |
| ladybird | `master` | `45bdd5eb09634cfb98b810c55bb3ccd98a501080` | Clean |

## Acceptance rules

- `PASS/PASS` means technical behavior and logical output both satisfy the case.
- `PASS/FAIL` means the command works, but its generated context or guidance is materially wrong,
  incomplete, unsupported, confusing, or repository-specific.
- `FAIL/N/A` means technical behavior prevents a meaningful logical evaluation.
- Every failure records reproduction, expected behavior, actual behavior, evidence, severity, and
  the cycle containing the correction and retest.
- Version `0.4.0` is forbidden until every required case is `PASS/PASS`, both targets are restored,
  and `pnpm verify` succeeds on the final CCR tree.

## Test matrix

### A. Package and first-use flow

| ID | Case | requesta | ladybird | Notes |
|---|---|---|---|---|
| A01 | Build and pack from the exact CCR worktree | Pending | Pending | Inspect tarball, not source tree |
| A02 | Tarball contains runtime CLI, docs, license, and all skill content | Pending | Pending | No dependency on unpackaged source |
| A03 | Local npm install succeeds without changing target Git hooks or context | Pending | Pending | Install must be inert |
| A04 | Installed `ccr --version` matches package version | Pending | Pending | Also compare CLI source constant |
| A05 | Installed help exposes every supported command and no roadmap-only feature | Pending | Pending | Average-developer clarity |
| A06 | Commands work from a nested repository directory | Pending | Pending | Root discovery |
| A07 | Failure outside a Git repository is clear and non-destructive | Pending | Pending | Boundary error |
| A08 | First-use flow needs only install, config init, setup, and Claude skill operation | Pending | Pending | No hidden learning step |

### B. Configuration control plane

| ID | Case | requesta | ladybird | Notes |
|---|---|---|---|---|
| B01 | `config init` is preview-only | Pending | Pending | No files written |
| B02 | `config init --apply` creates config plus aligned manual | Pending | Pending | Human-readable output |
| B03 | Repeated config init is idempotent and preserves supported values | Pending | Pending | Manual may upgrade |
| B04 | `config defaults`, `config`, and generated JSON agree | Pending | Pending | Minimal public schema |
| B05 | `config validate` accepts every valid combination | Pending | Pending | Pairwise config matrix |
| B06 | Invalid JSON, unknown keys, wrong types, empty domain, and out-of-range values fail clearly | Pending | Pending | No writes |
| B07 | `config set` preview changes nothing; `--apply` changes only the exact key | Pending | Pending | Human ownership |
| B08 | Test `domain` empty, 1, 80, and 81 characters | Pending | Pending | Boundary values |
| B09 | Test `hooks.enabled` true/false with `checkBeforeCommit` true/false | Pending | Pending | All four combinations |
| B10 | Test journal count 1/3/10 and reject 0/11/non-integer | Pending | Pending | Observable journal reads |
| B11 | Test compaction cap 20/25/30 and reject 19/31/non-integer | Pending | Pending | Observable Claude output |
| B12 | Test both instruction pointer booleans in all combinations | Pending | Pending | Existing files preserved |
| B13 | Supported legacy schema migrates in memory without implicit rewrite | Pending | Pending | Upgrade path |
| B14 | Local config can only tighten permitted local behavior | Pending | Pending | Cannot weaken privacy |
| B15 | Skills never edit config without exact human approval | Pending | Pending | Claude transcript and Git diff |

### C. Setup and managed artifacts

| ID | Case | requesta | ladybird | Notes |
|---|---|---|---|---|
| C01 | Text and JSON setup previews are accurate and write nothing | Pending | Pending | Compare with apply diff |
| C02 | `setup --apply` creates all promised context and skills | Pending | Pending | Tarball-installed binary |
| C03 | Repeated setup is idempotent | Pending | Pending | No content or timestamp churn |
| C04 | Existing user context is preserved | Pending | Pending | All shared pages |
| C05 | Package-marked skills upgrade; user/foreign skills are preserved | Pending | Pending | Ownership markers |
| C06 | Malformed/duplicate managed blocks stop safely | Pending | Pending | No partial corruption |
| C07 | Symlink/junction/traversal attempts outside repo are refused | Pending | Pending | Files and hooks |
| C08 | Existing `.gitignore` content survives and local rules appear once | Pending | Pending | Line-ending variants |
| C09 | Opted-in root instruction blocks compose with existing content | Pending | Pending | CLAUDE and AGENTS |
| C10 | Opted-out instruction files remain byte-for-byte unchanged | Pending | Pending | Defaults |
| C11 | Setup applies the configured hook policy through the installed skill workflow | Pending | Pending | Must be repository-adaptive |
| C12 | Partial old installation upgrades without overwriting human content | Pending | Pending | Missing and legacy artifacts |

### D. Evidence and privacy broker

| ID | Case | requesta | ladybird | Notes |
|---|---|---|---|---|
| D01 | `context files` lists safe index roots and bounded prefixes | Pending | Pending | Huge-repo truncation |
| D02 | `context read` returns committed/index content, never newer unstaged content | Pending | Pending | Direct comparison |
| D03 | `context changes` lists allowed staged paths and excluded count | Pending | Pending | JSON stable |
| D04 | `context diff` exposes only an approved staged file and is bounded | Pending | Pending | Binary and large diffs |
| D05 | `context recent` covers latest five commits and only current readable files | Pending | Pending | Rename/delete cases |
| D06 | Mandatory secrets, credentials, student data, local state, and response files are excluded | Pending | Pending | Case-insensitive globs |
| D07 | Configured/local extra exclusions are additive | Pending | Pending | Cannot remove mandatory rules |
| D08 | Symlinks, submodules, and non-regular index entries are not readable | Pending | Pending | Mode checks |
| D09 | Absolute, parent, control-character, and untracked paths are rejected | Pending | Pending | Terminal safety |
| D10 | Claude operations use broker commands instead of direct repository reads | Pending | Pending | Transcript/tool audit |

### E. Context skill operations and logical quality

| ID | Case | requesta | ladybird | Notes |
|---|---|---|---|---|
| E01 | `/ccr` accurately explains installed/current scope | Pending | Pending | No roadmap confusion |
| E02 | Unknown `/ccr-context` operation shows only valid choices | Pending | Pending | No accidental action |
| E03 | Initialize proceeds with no optional outside context | Pending | Pending | Fresh setup |
| E04 | Initialize integrates supplied plans as future intent, not existing behavior | Pending | Pending | Exact external file/text |
| E05 | Initialize uses bounded independent discovery and verification | Pending | Pending | Subagent behavior |
| E06 | Project narrative states purpose, real workflows, constraints, failures, and verification | Pending | Pending | Evidence-backed review |
| E07 | Stakeholders identify repository-supported people, roles, access, and impacts | Pending | Pending | No invented people |
| E08 | Every material claim has a live, relevant citation and no unsupported absolutes | Pending | Pending | Manually verify against code |
| E09 | Important small constraints are present; directory trivia and copied source are absent | Pending | Pending | Logical completeness |
| E10 | Update from staged changes modifies only affected claims | Pending | Pending | Context-worthy commit |
| E11 | Update after commit uses recent paths and completes the existing journal | Pending | Pending | Post-commit flow |
| E12 | Trivial commit completes journal without needless project-context churn | Pending | Pending | Logical restraint |
| E13 | Verify finds planted stale, contradicted, missing, and unsupported claims | Pending | Pending | One correction pass |
| E14 | Verify correctly reports no change when context is current | Pending | Pending | Avoid churn |
| E15 | Addition waits for input and integrates only the smallest relevant change | Pending | Pending | Intent labeling |
| E16 | Compact obeys 20%, 25%, and 30% caps using actual character counts | Pending | Pending | Before/after evidence |
| E17 | Repeated compaction preserves causal links, constraints, citations, and uncertainty | Pending | Pending | No semantic erosion |
| E18 | Every operation validates, shows one diff, applies once, and asks for one review | Pending | Pending | No loops/commits/pushes |
| E19 | Prompts remain neutral across Python, TypeScript/React, C++, CMake, and mixed repositories | Pending | Pending | No language hardcoding |
| E20 | Generated context is concise and useful to an average developer | Pending | Pending | Human usability judgment |

### F. Journals and branch continuity

| ID | Case | requesta | ladybird | Notes |
|---|---|---|---|---|
| F01 | Manual journal creation records UTC timestamp, branch, commit, and skeleton | Pending | Pending | Local ignored path |
| F02 | Same-second journal creation never overwrites | Pending | Pending | Numeric suffix |
| F03 | Branch names map safely and independently; detached HEAD works | Pending | Pending | Hash collision guard |
| F04 | `context journals` returns newest configured 1/3/10 for current branch only | Pending | Pending | Sort and boundary values |
| F05 | Branch metadata mismatch is rejected | Pending | Pending | Tamper test |
| F06 | Post-commit creates at most one entry per commit and records changed paths | Pending | Pending | Repeated hook invocation |
| F07 | Claude completes summary/outcomes under 1,200 characters without staging it | Pending | Pending | Logical quality |
| F08 | Context-only and local-state-only commits do not create update loops | Pending | Pending | Prompt behavior |

### G. Repository-adaptive hooks and commits

| ID | Case | requesta | ladybird | Notes |
|---|---|---|---|---|
| G01 | Skill inspects existing hook system and proposes the repository-native integration | Pending | Pending | Pre-commit vs custom/native/Husky |
| G02 | Clean repo with default `.git/hooks` receives composable advisory behavior | Pending | Pending | Preserve existing hook |
| G03 | Configured in-repo `core.hooksPath` receives composable behavior | Pending | Pending | Existing custom content |
| G04 | Husky layout is handled without editing internal `_` files | Pending | Pending | Existing commands preserved |
| G05 | Python pre-commit framework is integrated using its own specification | Pending | Pending | requesta current setup |
| G06 | C++ repository hook conventions are respected without adding JS framework dependencies | Pending | Pending | ladybird |
| G07 | Enabling hooks is explicit through config/setup and idempotent | Pending | Pending | No package postinstall mutation |
| G08 | Disabling hooks removes only CCR-owned integration | Pending | Pending | Other hook behavior survives |
| G09 | Pre-commit warns for staged repository-only change when enabled | Pending | Pending | Commit still succeeds |
| G10 | Pre-commit is silent when shared context is also staged | Pending | Pending | No false warning |
| G11 | `checkBeforeCommit: false` suppresses only pre-commit warning | Pending | Pending | Post-commit remains |
| G12 | Post-commit warns/prompts for context-worthy repository commit | Pending | Pending | Copy-paste instruction works |
| G13 | Post-commit handles context-only, local-only, empty, and merge commits sensibly | Pending | Pending | No loops |
| G14 | Missing/broken CCR executable never blocks the repository commit | Pending | Pending | Clear advisory fallback |
| G15 | Existing hook failure semantics remain unchanged | Pending | Pending | CCR cannot mask failures |
| G16 | Hooks never invoke Claude, edit shared context, stage, commit, or push | Pending | Pending | Technical audit |

### H. Validation, uninstall, and restoration

| ID | Case | requesta | ladybird | Notes |
|---|---|---|---|---|
| H01 | Context validation accepts correct generated context | Pending | Pending | Fresh and initialized |
| H02 | Validation catches missing headings/files, oversized files, secrets, unsafe/broken routes | Pending | Pending | One defect at a time and combined |
| H03 | Validation handles legitimate universal prose without over-rejecting words | Pending | Pending | False-positive audit |
| H04 | Uninstall preview is accurate and write-free | Pending | Pending | With and without context |
| H05 | Default uninstall removes integration but preserves shared and all local context | Pending | Pending | Skills/hooks/pointers |
| H06 | `--remove-context` removes only known shared CCR files | Pending | Pending | User additions preserved |
| H07 | Ignore rules remain while any local CCR state exists | Pending | Pending | Journals/private/cache/tmp |
| H08 | Reinstall after uninstall behaves like a clean first-use flow | Pending | Pending | No stale markers |
| H09 | Each cycle restores target branch, commit, hooks config, ignored files, and package manifests | Pending | Pending | Compare baseline snapshots |
| H10 | Final CCR `pnpm verify` and changed-test blast report pass | Pending | Pending | Release gate |

## Cycle log

### Cycle 0 — inventory and baseline

- Status: In progress.
- Confirmed current package version: `0.3.0`.
- Confirmed current CLI implements context management only; reviewer commands and GitHub Action are
  roadmap items.
- Preliminary architectural mismatch: hook script bodies and installation decisions currently live
  in `src/context/hooks.ts`. The mission requires repository-adaptive skill reasoning to own hook
  design, with deterministic code limited to safe primitives and execution boundaries.
- Preliminary documentation mismatch: `CHANGELOG.md` says package postinstall installs hooks, while
  `package.json`, `README.md`, and `USER_MANUAL.md` say package installation is inert and setup owns
  hook reconciliation.

### Cycle 1 — current 0.3.0 packed baseline

- Tarball SHA-1: `765efb8bab7121456ea2620dbd6476c35eb260f5`.
- Tarball contents: `LICENSE`, `README.md`, `dist/cli/index.cjs`, and `package.json`.
- Package smoke: pass; four files installed.
- Repository gates before real E2E: safety, audit, typecheck, lint, 97 tests, coverage, and build
  passed. Two credentialed ASU API cases were skipped because their environment variables were not
  configured. Package smoke passed when run with filesystem access to its temporary npm cache.
- Local install was inert in both target repositories. Requesta's pre-existing 10-byte shell hook
  stubs remained byte-for-byte unchanged; Ladybird still had no hooks after package installation.
- Text and JSON setup previews agreed and wrote nothing. Default setup and repeated setup were
  technically idempotent in both repositories.
- Valid config boundary values were accepted; out-of-range values, invalid booleans, and unknown
  keys were rejected without changing the file.
- Requesta initialization used the installed tarball with domain `education-software`, three
  discovery agents, and one verification agent. It made 150 model API turns and reached the
  20-minute E2E timeout before returning a terminal result. The trace remained active throughout.
- Before termination, Claude produced a 9,992-character `project.md`, a 4,558-character
  `stakeholders.md`, and a 1,092-character journal. `ccr context validate` passed. Because the CLI
  did not return, this is `FAIL/FAIL`, not a successful initialization.

## Findings

### F001 — Hook design is code-owned rather than skill-owned

- Type: Architectural/technical.
- Severity: Critical for the requested mission.
- Evidence: `src/context/hooks.ts` selects hook paths, accepts only POSIX/Husky content, and embeds
  both executable hook bodies. `ccr setup --apply` installs them directly without Claude or a
  repository-aware skill. Existing Node and Python hooks are deliberately rejected.
- Impact: behavior is not adaptive to a repository's hook framework, language, conventions, or
  hook specification. It cannot satisfy universal skill-driven setup.
- Status: Confirmed; pending fix and real-repository retest.

### F002 — Initialization is too expensive, opaque, and slow

- Type: Technical/usability.
- Severity: High.
- Reproduction: Run `/ccr-context initialize` through Claude Code 2.1.227 with the packed 0.3.0
  skill in Requesta and no outside context.
- Actual: 150 API turns; three discovery agents took about five minutes, the verifier about seven,
  and the correction/finalization about six. The process exceeded 20 minutes and never returned a
  result. There was no progress output in print mode.
- Expected: bounded repository discovery that completes predictably and reports a final result.
- Status: Confirmed; pending prompt simplification and retest.

### F003 — Context confuses correct-answer data with student-response data

- Type: Logical.
- Severity: High.
- Actual claims: `project.md` says "Student data is involved"; `stakeholders.md` says students'
  answers live in `QuestionVersion.answer` and `answer_explanation`.
- Source verification: `backend/models.py` explicitly documents `QuestionVersion` as a snapshot of
  a question's correct answer; `backend/answer_schema.py` validates correct MCQ options, acceptable
  fill answers, and true/false answers. No student model, response model, or student-response field
  exists. The only repository matches for "student" are absent; FERPA comments apply to user PII
  logging and do not prove student data is stored.
- Expected: identify students as potentially affected by generated educational content while
  explicitly stating that the repository does not show student identities or responses.
- Status: Confirmed; pending skill examples/verification criteria and fresh retest.

### F004 — Context targets the validator ceiling instead of a concise operating size

- Type: Logical/usability.
- Severity: Medium.
- Evidence: final `project.md` was 9,992 characters against a 10,000-character hard limit; an
  intermediate verified draft grew above 15,000 bytes before a late correction.
- Impact: almost no room remains for future updates, and the output is harder for an average
  developer to use. The verifier initially added detail instead of enforcing concision.
- Status: Confirmed; pending a lower prompt target and retest.

### F005 — Shipped skill metadata and examples do not follow the required skill guide

- Type: Technical/prompt quality.
- Severity: High.
- Evidence: both generated `SKILL.md` files have only `description` frontmatter and omit required
  `name`; the context skill has no structured examples despite its complex multi-operation flow.
- Expected: what/when frontmatter, concrete success criteria, error handling, progressive
  disclosure where useful, and representative trigger/functional examples.
- Status: Confirmed; pending skill redesign and validation.

### F006 — Config errors expose raw Zod issue arrays

- Type: Technical/usability.
- Severity: Medium.
- Evidence: `config set domain <81 chars> --apply` and numeric boundary failures print multiline
  Zod JSON such as `code: too_big`, internal paths, and origin fields.
- Expected: one concise message naming the setting, accepted range/type, and received value.
- Status: Confirmed; pending boundary error formatting and CLI E2E retest.

### F007 — Release documentation contradicts package behavior

- Type: Documentation/logic.
- Severity: Medium.
- Evidence: `CHANGELOG.md` says 0.3.0 package `postinstall` automatically installs hooks, while the
  current `package.json` has no postinstall and both manuals correctly say install is inert.
- Status: Confirmed; pending correction.

### F008 — Managed-block logic is duplicated and has diverged

- Type: Complexity/duplication.
- Severity: Medium.
- Evidence: `src/context/hooks.ts` implements its own marker matching, block finding, replacement,
  and removal while `src/context/managed-block.ts` implements a second marked-block engine. Their
  whitespace and error semantics differ.
- Bug risk: fixes to malformed-marker handling or whitespace preservation can land in one boundary
  and not the other; the duplicated hook implementation already needs separate tests for behavior
  that the shared boundary covers.
- Status: Confirmed; pending validated minimalist refactor after behavior fixes.

### Cycle 2 — skill-driven hook and bounded-context candidate

- Tarball SHA-1: `1e2fd18fe60153d7776a78638e3198df9dc69c1d`.
- Repository gates: 101 runnable tests, coverage thresholds, audit, typecheck, lint, build, and
  unrestricted package smoke passed. Two credentialed ASU API tests remained intentionally skipped.
- Package installation was inert in both repositories. All six generated skills passed the official
  skill-creator `quick_validate.py` check.
- Setup installed `/ccr-hooks` but left hook design untouched. During Requesta initialization, the
  skill inspected the repository and composed minimal POSIX blocks with the existing shell stubs.
- The Requesta run was terminated after more than ten minutes as a confirmed throughput failure. At
  termination it had made 51 API requests but delegated only one task. Its 5,682-character project
  and 1,898-character stakeholder files passed structural validation, but no required journal or
  terminal result existed.

### F009 — Fixed low subagent count serializes time-consuming discovery

- Type: Technical/usability.
- Severity: High.
- Evidence: cycle 2 made 51 API turns and only one `Task` dispatch in more than ten minutes. The
  installed skill allowed only one or two discovery agents even for repositories with independent
  frontend, backend, data, operations, and external-integration traces.
- Expected: choose agent count from repository breadth and launch independent evidence traces in
  parallel, using the harness's available concurrency without duplicating reads.
- Status: Confirmed; prompt change and fresh retest required.

### F010 — Context invents authorship for correct-answer data

- Type: Logical.
- Severity: High.
- Actual: cycle-2 `project.md` called `QuestionVersion.answer` “teacher-authored.”
- Source verification: `backend/models.py:109` documents only a versioned correct answer. No inspected
  serializer, view, service, or UI evidence identifies the author. Correct-answer semantics do not
  establish whether a teacher, generator, importer, or another system writes the field.
- Expected: state only that the field stores a correct answer unless a live write path proves its
  author or origin.
- Status: Confirmed; evidence-attribution rule and example required.

### F011 — Context turns an external contract into an implemented data flow

- Type: Logical.
- Severity: High.
- Actual: cycle-2 `project.md` claimed Django extracts and forwards material content to the external
  generation service after also stating generation code is absent from the repository.
- Source verification: `backend/question_sets/views.py:48` saves the question set inside a transaction;
  the inspected repository contains Bruno contract examples but no evidenced extraction/forwarding
  implementation in that create path.
- Expected: label the Bruno files as an external contract/example and preserve the missing internal
  orchestration as an open question.
- Status: Confirmed; evidence-attribution rule, verifier criterion, and fresh retest required.

### F012 — Aggregate schema summaries overstate uniform fields

- Type: Logical.
- Severity: Medium.
- Actual: cycle-2 `project.md` said all six tables have both `created_at` and `updated_at`.
- Source verification: `QuestionVersion` has `created_at` but no `updated_at` in `backend/models.py`.
- Expected: do not apply a common-field claim to a set until every member has been checked; describe
  exceptions when they affect lifecycle reasoning.
- Status: Confirmed; verifier criterion and fresh retest required.

### Cycle 2b — adaptive parallel Requesta initialization

- Tarball SHA-1: `7776c2dc3aabfec8f1b35cb41bb30049d94558a9`.
- Full `pnpm verify` passed: safety, audit, typecheck, lint, 101 runnable tests, coverage, build,
  and package smoke. Two credentialed ASU API cases were skipped.
- Claude completed with a terminal success in 8m51s. The trace shows six discovery `Agent`
  dispatches for independent frontend, backend, data, authorization, operations, and external-contract
  traces, followed by one verifier. Discovery agents completed in about two minutes.
- Output sizes: project 6,714 characters, stakeholders 1,813, completed journal 1,133. Validation and
  hook status passed. No files were staged, committed, or pushed by Claude.
- F010 fixed: correct-answer meaning is separated from unproven authorship. F011 fixed: Bruno files
  are described as a contract with no application-side caller evidenced. F012 fixed: model field
  exceptions are explicit. Student identities/responses are not inferred.

### F013 — A resolvable recent-change fact is retained as an open question

- Type: Logical.
- Severity: Medium.
- Actual: project and stakeholder context ask where the latest `#71` authentication-race fix lives
  and speculate that it is “likely” in unverified files.
- Source verification: the current commit message names #71; `git show 6596e70 --name-only` identifies
  `frontend/src/app/login/LoginForm.tsx`, `frontend/src/constants/routing.ts`, and
  `frontend/src/proxy.ts`. The diff shows the login redirect and `/login` proxy behavior that close
  the race.
- Expected: before retaining an open question derived from recent history, inspect the bounded changed
  paths and relevant current files. Resolve it when evidence exists; otherwise state only the unknown,
  without speculative locations.
- Status: Confirmed; prompt rule and verify retest required.

### F014 — Update creates and removes a redundant journal

- Type: Technical/minimalism.
- Severity: Medium.
- Reproduction: let post-commit create the HEAD journal, then run `/ccr-context update` for a trivial
  commit.
- Actual: update correctly left shared context unchanged and completed the hook-created entry, but it
  also invoked journal creation, produced an empty duplicate, and deleted that duplicate.
- Expected: call `context journals`, reuse the entry whose commit matches HEAD, and call
  `context journal` only when no matching entry exists. Never delete a journal that predated the
  current operation.
- Risk: unnecessary writes complicate the simple update path and a mistaken duplicate selection could
  erase continuity data.
- Status: Confirmed; prompt rule and fresh update retest required.

### F015 — Config follow-up still describes the removed hardcoded hook flow

- Type: Technical/usability.
- Severity: Medium.
- Actual: applying `hooks.checkBeforeCommit=false` prints “Run `ccr setup --apply` to reconcile
  CCR-managed hooks.” The check reads config at runtime, so no reconciliation is needed; setup no
  longer designs or installs enabled hooks.
- Expected: `hooks.checkBeforeCommit` says the value takes effect immediately. `hooks.enabled=true`
  points to `/ccr-hooks sync`; disabling points to `/ccr-hooks remove` (with setup mentioned only for
  removal of legacy direct managed blocks).
- Status: Confirmed; CLI output fix and E2E retest required.

### F016 — One small addition consumes all reserved context capacity

- Type: Logical/usability.
- Severity: High.
- Actual: initialization produced a 6,714-character project against the 7,000 prompt target; adding
  one future-intent paragraph grew it to 6,983, leaving 17 characters.
- Expected: initialization targets a smaller operating size and every operation preserves explicit
  growth reserve. If existing context is above the operating target, addition should compress nearby
  prose before integrating new durable knowledge.
- Status: Confirmed; separate operating/hard targets and fresh initialize/addition retest required.

### F017 — Generated citations use directory/glob shorthand instead of live evidence paths

- Type: Logical/verifiability.
- Severity: Medium.
- Actual: the added paragraph cites `backend/question_sets/`; other output cites
  `docs/bruno/gen-service/\*.bru`. Neither names an exact live file and symbol/contract.
- Expected: material claims cite exact repository files plus a symbol, test, command, or contract;
  directories and globs may guide discovery but are not final evidence citations.
- Status: Confirmed; evidence rule and fresh logical retest required.

### F018 — Compaction makes a field modifier ambiguous

- Type: Logical.
- Severity: Medium.
- Actual after compaction: ``User = PII (`email`, `first_name`, `last_name` unique; UUID PK...)``.
  This reads as if all three fields are unique.
- Source verification: `backend/models.py:21` sets `unique=True` only on `email`; `first_name` and
  `last_name` are plain `CharField`s.
- Expected: compaction must preserve which item a constraint, default, ownership rule, or qualifier
  modifies. Prefer a few extra characters over ambiguous shared modifiers.
- Status: Confirmed; semantic compaction rule and fresh compaction retest required.

### F019 — Hook removal deletes pre-existing empty hook stubs

- Type: Technical/data preservation.
- Severity: Critical.
- Baseline: Requesta had 10-byte `#!/bin/sh` pre-commit and post-commit files before CCR.
- Actual: sync appended CCR blocks; remove invoked the legacy remover, then deleted the remaining
  shebang-only files and incorrectly claimed they were “CCR-created today” and matched pre-CCR state.
- Expected: sync records local provenance before the first write. Removal restores pre-existing
  containers byte-for-byte and deletes a now-empty container only when provenance proves CCR created
  it. With missing provenance, remove markers conservatively and retain the container.
- Source verification: `removeContextHook` already preserves remaining bytes; the destructive step
  was the skill's unsupported inference and subsequent file deletion.
- Status: Confirmed; hook skill provenance/removal redesign and fresh stub/absent/framework retest
  required.

### Cycle 3 — Ladybird large C++ initialization

- Tarball SHA-256: `906932C3ED8C26F156DEB2394D382E254032687AA205BB8931830AE5A764D7E9`.
- Non-default configuration passed preview/apply/validate for `domain=browser-engine`,
  `recentJournalEntries=10`, and `maxCompactionPercent=30`.
- All three generated skills passed Anthropic's `quick_validate.py`.
- Claude initialized Ladybird in 9m50s with eight parallel discovery agents and one independent
  verifier. One WebDriver process-enum mistake was caught and corrected before completion.
- Context validation passed. Initialize sizes were 5,178 characters for project context and 2,359
  for stakeholders, within the 6,000/2,500 operating targets. A later verifier correction kept the
  files within the 6,500/2,800 continuing-operation targets.
- Hook sync selected minimal POSIX hooks, recorded both absent baselines in
  `.ccr/private/hooks-state.json`, and status reported no drift. Pre-commit returned success; a real
  commit succeeded; post-commit created one HEAD journal and printed the repair instruction.
- No push occurred.

### F020 — Equivalent Windows support statements are reported as contradictory

- Type: Logical.
- Severity: Medium.
- Actual: initial Ladybird stakeholder context retained an open question claiming Windows support
  was stated inconsistently because README documents WSL2, the contributing guide documents WSL,
  and CI has a native ClangCL build.
- Source verification: `README.md` under “How do I build and run this?” says Windows with WSL2;
  `Documentation/GettingStartedContributing.md` under “Building the code” says Windows requires
  WSL. Those user-facing runtime contracts agree. A native CI build gate does not by itself claim a
  supported native runtime.
- Expected: compare claims at the same scope before calling them contradictory. Build coverage,
  runtime support, and release support are distinct contracts.
- Status: Corrected in the partial update output; prompt rule added; fresh bounded retest required.

### F021 — Focused update expands into an initialization-sized audit and times out

- Type: Technical/usability/minimalism.
- Severity: High.
- Reproduction: run `/ccr-context update` for one trivial committed probe while supplying two
  focused context defects to correct.
- Actual: Claude launched seven audit agents, made 112 shell calls and 11 edits, then launched an
  eighth verifier. The operation exceeded 15 minutes and terminated without a final result.
- Positive partial evidence: it reused and completed the existing HEAD journal rather than creating
  another, corrected the Windows-support statement, validated context, and stayed within size
  targets.
- Expected: size work by operation scope, not total repository size. A one-trace focused operation
  uses direct bounded reads plus one verifier and targets five minutes; multi-trace repairs use at
  most one small parallel wave.
- Status: Confirmed; failing prompt-contract test added first, operation-scoped budget implemented,
  fresh packaged retest required.

### Cycle 3b — Requesta mixed-stack initialization

- Tarball SHA-256: `407ED56D60902A8875E82948D6F98981A966433979E5E2EDC9FDC9A6964CA6B2`.
- Non-default configuration passed with `domain=assessment-platform`, one recent journal, and the
  lower 20% compaction cap. All generated skills passed Anthropic's validator.
- Claude used six parallel discovery agents and one independent verifier. Context validated at
  5,283/2,177 characters; #71 was resolved from its actual changed paths; correct-answer data,
  external-generation intent, and model field exceptions remained properly qualified.
- Initialization took 14m09s. Before discovery, one shell command timed out at 120 seconds and
  another took 70 seconds; local/bounded framework probing is required in the next hook skill.
- Provenance correctly recorded both pre-existing hook containers, but round-trip byte restoration
  failed as F023.

### F022 — Aggregate workflow summary misclassifies triggers and omits a workflow

- Type: Logical/verifiability.
- Severity: Medium.
- Actual: generated context says “CI has four PR workflows” but its list includes `playwright.yml`,
  which is manual-only, and omits `create-asana-attachment.yaml`.
- Source verification: the repository has five workflow files. Three use `pull_request`, one uses
  `pull_request_target`, and Playwright uses only `workflow_dispatch` (its push/PR triggers are
  commented out).
- Expected: enumerate every member of a workflow/config collection and classify relevant triggers
  before making an aggregate statement; name exceptions explicitly.
- Status: Confirmed despite a no-defects verifier result; prompt-contract test and rule added; fresh
  focused verify required.

### F023 — Hook round trip leaves an extra separator newline

- Type: Technical/data preservation.
- Severity: Critical.
- Baseline: both Requesta hooks were exactly 10 bytes, `#!/bin/sh\n`.
- Actual: sync appended a blank separator outside the CCR marker span. Removal stripped the marker
  blocks but left that newline; both hooks became 11 bytes, `#!/bin/sh\n\n`. Claude incorrectly
  claimed byte-for-byte preservation.
- Expected: provenance records original byte length/hash and exact `separatorByteCount`. Sync adds
  no separator when the file already ends in a line terminator. Removal deletes the complete
  managed span plus only recorded separator bytes, verifies length/hash, and retains state on
  mismatch.
- Status: Confirmed; failing tests added first, provenance/removal contract redesigned, exact fresh
  10-byte round-trip retest required. F019 remains open until this passes.

### Cycle 3c — exact hook restoration

- Tarball SHA-256: `1AA25B85698837B2E088A4354939FB8F41CB675560F850452C19D4C03894A64D`.
- Sync recorded both original 10-byte hashes, byte lengths, and `separatorByteCount: 0`; no probe
  exceeded 3.1 seconds and neither hook was executed.
- Removal completed in 44 seconds. Independent checks confirmed both hooks were exactly 10 bytes
  with SHA-256 `A8076D3D28D21E02012B20EAF7DBF75409A6277134439025F282E368E3305ABF`,
  and provenance state was removed only after matching.
- F019 and F023 are fixed for the pre-existing-native-hook case. Ladybird cycle 3b already passed
  the absent-container deletion case.

### F024 — Focused verifier performs a second repository search and misses time budget

- Type: Technical/usability/minimalism.
- Severity: High.
- Actual: cycle-3c `/ccr-context verify` correctly used zero discovery agents and made six focused
  edits, then its single verifier used repository tools broadly enough that the operation exceeded
  a six-minute hard ceiling without a final result.
- Partial output was valid and corrected F022 plus full repository-relative citations, but the
  operation did not complete its journal/final response contract.
- Expected: the main agent supplies a bounded evidence packet containing the proposed diff, material
  claims, and exact broker excerpts. The focused verifier uses no tools, performs independent
  reasoning on that packet, and returns defects in one response. Initialize retains source-reading
  verification because its scope warrants it.
- Status: Confirmed; failing prompt-contract test added first, no-tool focused verifier implemented,
  fresh packaged retest required.

### Cycle 3d — no-tool focused verification

- Tarball SHA-256: `D366E9BD3B510AEC73DAAD3F436443A74F1F7AF2D7AA976DB7CAE97EAB6B1851`.
- Focused Requesta verification completed in 5m03s with zero discovery agents and one verifier that
  made zero tool calls. The verifier caught the `pre-commit.yml` changed-files qualifier applying
  only to PR runs; the manual run is full. One correction pass succeeded and context validated.
- Exactly one HEAD journal was reused and remained within the limit at 1,199 characters. F022 and
  F024 are fixed for focused verify.

### F025 — Semantic compact inherits an unrealistically short focused budget

- Type: Technical/usability.
- Severity: Medium.
- Actual: a 20%-cap compact stayed on the correct zero-discovery path and launched one no-tool
  verifier, but reached the 5.5-minute test ceiling immediately after verifier completion, before
  applying/finalizing its semantic compression.
- Expected: update, verify, and addition retain a five-minute target. Compact receives eight minutes
  because it must measure and rewrite the full shared context while preserving modifiers, exact
  citations, causal links, and uncertainty.
- Status: Confirmed; prompt-contract test and separate compact budget added; fresh packaged compact
  retest required.

### Cycle 3e — compaction and addition

- Tarball SHA-256: `E2147AF1CE27F2E7E1854C0C6C76D0AA3F58696DEA2B1984730033D813EA0652`.
- Compact completed in 7m50s with zero discovery agents and one no-tool verifier. Independent counts
  show 7,665 combined characters after versus 8,436 before (about 9.1% removed), below the configured
  20% cap. All requested modifiers, trigger exceptions, #71 behavior, privacy distinction, and
  external-contract uncertainty survived. One HEAD journal remained under 1,200 characters.
- Addition completed in 2m15s with zero discovery agents and a no-tool verifier, preserving size
  reserve and one journal, but introduced F026.

### F026 — Addition converts a non-claim into a false absence claim

- Type: Logical.
- Severity: High.
- Actual: the human supplied future CSV-export intent and said no current implementation was being
  claimed. Generated context changed that into “no in-repo export file or caller exists.”
- Source verification: `frontend/src/utils/microcopy.ts` already defines an extensive export UI
  contract with DOCX, JSON, PDF, and QTI options, selection behavior, metadata, and answer-key copy.
  No live export component/caller was found in the inspected question-set UI, but the broad “no
  export file” claim is false.
- Expected: “the human did not claim X” is not evidence that X does not exist. State only supplied
  future intent unless an exhaustive searchable boundary proves an absence; omit unsupported
  absence claims.
- Status: Confirmed despite a no-defects verifier; failing prompt-contract tests added first,
  addition/absence rule implemented, fresh packaged correction retest required.

### Cycle 3f — corrected future-intent addition

- Tarball SHA-256: `8D1EE6787A92D8DD454F49A92D5CEEA209F8B2943EBD06CA5B0B617DB37D8036`.
- Correction completed in 2m08s with zero discovery agents and one no-tool verifier.
- The final context retains CSV as future/undecided, says no CSV format/implementation/date was
  supplied, and accurately records `frontend/src/utils/microcopy.ts`
  `microcopy.mainWorkingViewQs.exportQs` as an intended interface for DOCX/JSON/PDF/QTI rather than
  a live implementation or caller. No repository-absence claim remains.
- Context validates, project/stakeholder files remain under operating limits, and one HEAD journal
  remains under 1,200 characters. F026 is fixed.

### F027 — Compaction leaves scratch drafts in the repository root

- Type: Technical/minimalism/cleanup.
- Severity: High.
- Actual: after otherwise successful cycle-3e compaction, Requesta contained four untracked root
  files: `old_project.tmp`, `project_draft.tmp`, `project_draft2.tmp`, and
  `stakeholders_draft.tmp`.
- Expected: keep the draft in memory and pass it directly in the verifier evidence packet. Never
  write scratch files to the repository root. If the harness requires storage, use only exact
  operation-created paths under ignored `.ccr/tmp/`, remove them before final validation, and never
  remove a pre-existing temp file.
- Status: Confirmed; failing prompt-contract tests added first, no-scratch/temp-cleanup contract
  implemented, fresh packaged compact retest required.

### Cycle 3g — scratch-free compact retry

- Tarball SHA-256: `92D61A8974019BFE4E3A578C85B05B32508CE34ADCF05840C6EEFD3693B1C51C`.
- The first Claude session stalled in one model response before any write and was terminated at the
  eight-minute boundary; it left no scratch files or context changes.
- A fresh retry completed in 3m50s as a correct no-op compact: 7,913 combined characters before and
  after, 0% removed because further cuts would drop exact evidence/modifiers. One no-tool verifier
  returned, context validated, and one HEAD journal remained at 1,181 characters.
- Independent filesystem checks found no root `*.tmp` and no files under `.ccr/tmp/`. F027 is fixed;
  the initial stall is recorded as a transient model-provider latency event rather than repository
  work or leaked state.

## Senior implementation audit — pre-refactor checkpoint

This checkpoint was written after three independent read-only reviews and direct reproductions,
before applying any of the fixes below. The reviews covered duplication, complexity, unnecessary
abstractions, behavior gaps, missing tests, and logical universality. No implementation change from
this section had been made when the checkpoint was recorded.

### F028 — Managed text blocks can consume user-owned bytes

- Type: Technical/data preservation.
- Severity: High.
- Evidence: `removeManagedBlock` in `src/context/managed-block.ts` applies `trimEnd()` to all text
  before CCR's block and `trimStart()` to all text after it, then reconstructs LF newlines. A direct
  reproduction removed indentation from `    keep-indented`; CRLF, trailing spaces, blank lines,
  and final-newline state can also change. Setup insertion similarly uses `trimEnd()`.
- Impact: setup/uninstall can alter content outside CCR's owned span in `.gitignore`, `CLAUDE.md`,
  and `AGENTS.md`, contrary to the bounded-removal contract.
- Required fix: one exact-line, byte-preserving marked-region parser/remover with tests for CRLF,
  trailing/leading whitespace, adjacent content, and final-newline variants.
- Status at checkpoint: Confirmed; not fixed.

### F029 — Inline marker examples are mistaken for owned blocks

- Type: Technical/data preservation.
- Severity: High.
- Evidence: generic marker counts and replacements in `src/context/managed-block.ts` are unanchored
  substring operations. A user sentence containing the literal paired markers was replaced during
  setup and partially deleted during uninstall. The hook implementation independently uses exact
  marker lines, demonstrating parser drift.
- Required fix: recognize markers only as complete lines and return an explicit
  `absent | valid | conflict` result. Malformed or duplicate exact markers must fail without writes.
- Status at checkpoint: Confirmed by direct reproduction; not fixed.

### F030 — Uninstall bypasses setup's managed-block validation

- Type: Technical/safety.
- Severity: High.
- Evidence: `previewUninstall` uses raw `includes`; `applyUninstall` uses permissive first-match
  removal. Duplicate blocks can leave one behind while uninstall reports success, and malformed
  blocks can be previewed as modifications but remain unchanged. Setup rejects the same conflicts.
- Required fix: preview and apply must share the same validated plan, and application must consume
  that plan rather than re-infer ownership differently.
- Status at checkpoint: Confirmed by source trace; not fixed.

### F031 — Hook lifecycle has incompatible skill and CLI ownership engines

- Type: Technical/logical architecture.
- Severity: High.
- Evidence: `/ccr-hooks` may create repository-native framework, YAML, JavaScript, Python, or Git
  hook integrations and records provenance in `.ccr/private/hooks-state.json`. CLI status and
  uninstall inspect only two hard-coded POSIX `#` blocks. A valid framework integration can be
  reported `not-installed`, survive `ccr uninstall --apply`, and still be described as removed.
  Conversely, CLI legacy cleanup does not consult the recorded hashes and separators.
- Required fix: make provenance/strategy state the lifecycle authority, or make CLI explicitly
  report unsupported skill-owned state and refuse to claim complete removal until `/ccr-hooks
  remove` has completed. Retain only narrowly named legacy-block cleanup in TypeScript.
- Status at checkpoint: Confirmed by source and contract comparison; not fixed.

### F032 — Setup status probing rejects valid external and linked-worktree hook layouts

- Type: Technical/universality.
- Severity: High.
- Evidence: `showSetup` unconditionally calls `readContextHookStatus`. The write-safety boundary in
  `resolveHook` rejects any hook path outside the worktree root. A reproduced external
  `core.hooksPath` made even setup preview exit 1. In a real linked Git worktree, Git's legitimate
  common `.git/hooks` directory is also outside the worktree root and was rejected. The skill prompt
  repeats the same blanket restriction.
- Required fix: separate non-throwing inspection (`installed | not-installed | unsupported`) from
  write authorization, and explicitly trust Git's resolved common hook directory for linked
  worktrees while continuing to reject arbitrary configured escapes and symlinks.
- Status at checkpoint: Confirmed by two real Git reproductions; not fixed.

### F033 — `setup --apply --dry-run` performs writes

- Type: Technical/CLI safety.
- Severity: Medium.
- Evidence: Commander accepts both flags, but `SetupOptions.dryRun` is never read. A real temporary
  repository invocation created the full setup when both flags were supplied.
- Required fix: make the flags conflict or make `--dry-run` unconditionally dominate `--apply`, and
  add an E2E regression.
- Status at checkpoint: Confirmed by real CLI reproduction; not fixed.

### F034 — Stale legacy hook blocks report current

- Type: Technical/status accuracy.
- Severity: Medium.
- Evidence: `readContextHookStatus` treats any well-formed marker span as `already-installed`
  without comparing its contents with the current definition. Installer tests cover upgrading an
  old block but never status before the upgrade.
- Required fix: distinguish stale content or limit the result to marker presence with an honest
  name. Add status coverage for current, stale, malformed, and absent blocks.
- Status at checkpoint: Confirmed by source trace; not fixed.

### F035 — Skill ownership marker is too weak

- Type: Technical/data preservation.
- Severity: Medium.
- Evidence: `isPackageManagedSkill` considers exactly one occurrence of the package marker anywhere
  in a file sufficient ownership. A user-authored skill that documents or quotes the marker can be
  overwritten by setup or deleted by uninstall.
- Required fix: require the marker in its canonical standalone location immediately after valid
  CCR skill frontmatter, or use a stronger versioned ownership header.
- Status at checkpoint: Confirmed by source trace and missing boundary tests; not fixed.

### F036 — Context validator rejects absolute words inside commands

- Type: Technical/logical validation.
- Severity: Medium.
- Evidence: the absolute-claim scan matches `all`, `never`, and `guaranteed` anywhere. Cycle 3d
  rejected the exact repository command `npm run test:all`, forcing the model to replace useful
  evidence with a different command despite no absolute prose claim.
- Required fix: exclude fenced and inline code from prose-only absolute-claim detection while still
  rejecting unsupported prose such as “the service never fails.”
- Status at checkpoint: Confirmed in packaged E2E; not fixed.

### F037 — Universal behavior remains education-biased

- Type: Logical/universality.
- Severity: High.
- Evidence: CLI/package wording describes educational-software review, mandatory privacy defaults
  exclude every `**/student-data/**` path, and the most detailed enforced prompt example is
  QuestionVersion/student-answer specific. In an unrelated repository, a legitimate source tree
  named `student-data` is silently hidden and the example biases context toward one domain.
- Required fix: use domain-neutral product language and examples; reserve mandatory exclusions for
  generic credential/private-state patterns and let repositories configure domain-specific paths.
- Status at checkpoint: Confirmed by source and documentation review; not fixed.

### F038 — Resolved discovery count is dead configuration

- Type: Complexity/unnecessary abstraction.
- Severity: Medium.
- Evidence: `discovery.subagentCount` is parsed, defaulted, migrated, and tested but has no production
  consumer; adaptive 1/3–5/6–8 discovery is defined by the skill. The hidden fixed maximum also
  contradicts the current adaptive contract.
- Required fix: remove it from the resolved/current shape while continuing to accept and discard
  the legacy field during migration.
- Status at checkpoint: Confirmed by reference search; not fixed.

### F039 — Dead scaffold modules add false architecture

- Type: Complexity/unnecessary abstraction.
- Severity: Low.
- Evidence: 20 tracked zero-byte TypeScript files under `src/cli/commands`, `src/core`, `src/git`,
  `src/github`, `src/log`, `src/patch`, and `src/prompt` have no references in source, tests, build,
  or package metadata. They imply extension boundaries without behavior or contracts.
- Required fix: delete the unreferenced empty scaffolds; add real modules only when a cohesive
  behavior needs them.
- Status at checkpoint: Confirmed by tracked-file and reference searches; not fixed.

### F040 — Release version has two sources of truth

- Type: Technical/release risk.
- Severity: High for the requested release.
- Evidence: `package.json` owns the package version, but `src/cli/index.ts` hard-codes `0.3.0`.
  Updating only the package would ship `0.4.0` whose `ccr --version` still reports `0.3.0`.
- Required fix: derive the CLI version from one build-time/package boundary and assert the packed
  CLI version matches `package.json`.
- Status at checkpoint: Confirmed by source review; not fixed.

### Validated refactor boundaries

- Consolidate the duplicate marked-block parsers, but keep hook path/interpreter policy outside the
  generic byte-preserving primitive.
- Delete `installContextHook` and `installAllContextHooks` if no documented compatibility API needs
  them; they have only test callers and conflict with skill-owned repository-native installation.
- Extend the managed-artifact registry to describe marked instruction/ignore integrations so setup
  and uninstall derive the same ownership policy instead of duplicating path conditionals.
- Split `src/cli/context.ts` only along command ownership boundaries; avoid helper-per-function
  indirection. Its 310 lines are a signal, not independently a defect.
- Keep `src/context/skills.ts` cohesive unless progressive-disclosure assets are actually installed,
  validated, and uninstalled by the package. Prompt length alone is not grounds for fragmentation.

## Cycle 4 — post-audit refactor and real-package regression

- Final pre-release test tarball SHA-256:
  `6DB3D84C9A4E4231F7C4FF3F5DC5D382D6C3E9077A2335135A864835F37F9898`.
- Installed from the tarball, not the CCR worktree, on fresh `codex/ccr-e2e-final` branches in both
  Requesta and Ladybird.
- `--version`, config init/set/validate, setup preview/apply, combined `--apply --dry-run`, context
  validation, and uninstall passed in both repositories. The official skill validator accepted all
  three installed skills in both repositories.
- A real external `core.hooksPath` remained untouched. Enabled setup reported it unsupported and
  completed; the first disabled-setup package run exposed a remaining removal-path exception. A
  failing E2E test was added, the CLI now skips unsafe legacy cleanup with an explicit message, and
  a freshly packed reinstall passed the same real disabled setup.
- Real Claude/DeepSeek `/ccr-hooks sync` in Requesta selected native composition over an inactive
  pre-commit framework, recorded both original 10-byte stub hashes and zero separator bytes, and
  never executed a hook during sync.
- CLI status delegated to `/ccr-hooks` while provenance existed. Both hook-only and full CLI
  uninstall stopped without changing files or falsely claiming removal.
- A real commit on the test branch passed. Pre-commit printed its advisory warning; post-commit
  created one journal and printed the copy-paste update instruction. Real `/ccr-context update`
  completed in 1m53s, reused that journal, correctly classified the probe as non-product test
  scaffolding, made no shared-context change, validated, and stopped.
- Real `/ccr-hooks remove` completed in 57s. Independent hashes confirmed both hooks were restored
  to their original 10-byte `#!/bin/sh\n` stubs with SHA-256
  `A8076D3D28D21E02012B20EAF7DBF75409A6277134439025F282E368E3305ABF`; provenance was removed only
  after verification.
- Full uninstall passed after provenance removal. Requesta was restored clean to `development` at
  `6596e7045761c53d40811d2ec9b99d06a8ef7ba2` with both original hook hashes. Ladybird was restored
  clean to `master` at `45bdd5eb09634cfb98b810c55bb3ccd98a501080` with both CCR hooks absent.

### Senior-audit resolution

- F028–F030: Fixed. Setup/uninstall share exact-line, byte-preserving managed-region inspection and
  validated preview plans; inline, malformed, duplicate, CRLF, whitespace, and concurrent-change
  cases are covered.
- F031–F034: Fixed. Skill provenance is authoritative, CLI claims are bounded, linked worktrees are
  supported, external paths are non-blocking/untouched, dry-run dominates apply, and legacy status
  distinguishes current, stale, absent, and unsupported.
- F035: Fixed. Package skill ownership requires valid frontmatter and the canonical standalone
  marker position.
- F036: Fixed. Absolute-claim validation ignores inline/fenced code while still rejecting absolute
  prose.
- F037–F039: Fixed. Product language/examples/privacy defaults are domain-neutral, dead discovery
  state and 20 empty scaffold modules are removed, and `src/cli/context.ts` was split at the real
  configuration-command boundary. The repository audit has no warnings.
- F040: Fixed and package-tested. CLI version derives from `package.json`, and packed-install smoke
  asserts exact equality. The release number remains unchanged at this checkpoint, pending the final
  release gate required before assigning `0.4.0`.

## Final release gate

- After every prior cycle and the senior refactor passed, the package version was assigned
  `0.4.0` on 2026-08-11.
- `pnpm verify` passed without audit or lint warnings: tracked-file safety, static audit, typecheck,
  Biome, coverage (27 files; 117 passed and two credential-dependent ASU API cases skipped), all
  builds, and packed-install smoke.
- Packed smoke installed four release files and independently confirmed `ccr --version` equals the
  package source of truth (`0.4.0`).
- Final release tarball: `D:\Code\ccr-final-release-0.4.0\vctrx-ccr-0.4.0.tgz`;
  SHA-256 `23F6289EA3063D689FC07554D689E5FF0BB1F363559E8F9B35E7F0234265AAAE`.
- `pnpm test:changed:print` mapped the expected context/CLI blast radius; all mapped unit,
  integration, and E2E suites were included in the passing verify gate.

### F041 — Affected-test runner masked subprocess failures

- Type: Technical/quality-gate integrity.
- Severity: High.
- Actual: the first local commit hook encountered a linked-worktree test failure but continued to
  commitlint and created the commit. `scripts/audit.mjs` wrapped every command in a helper that
  swallowed `execSync` failures and returned an empty string, so the outer affected-test failure
  handlers were unreachable.
- Root cause of the triggering test failure: Git-hook execution supplied `GIT_INDEX_FILE`; the
  isolated linked-worktree fixture inherited it, making Git resolve an invalid target-relative
  index lock. The product behavior had passed the full gate and five immediate isolated reruns.
- Fix: the command boundary now preserves nonzero exits and has explicit success/failure unit tests.
  The linked-worktree fixture clears Git's ambient repository/index variables for its isolated
  `git worktree add` command.
- Status: Fixed; final verify and amended commit gate required.
