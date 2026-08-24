import { MANAGED_SKILL_MARKER } from "../context/skill-marker";
import { REVIEW_DIMENSIONS } from "./dimensions";

const EXAMPLE_DIMENSION_SELECTION =
  REVIEW_DIMENSIONS.dimensions
    .slice(0, 2)
    .map(({ id }) => id)
    .join(", ") || "all";

const DIMENSION_SELECTION = `<dimension_selection>
1. Read \`.claude/skills/ccr/references/dimensions.md\` completely before planning the review.
2. Normalize \`$ARGUMENTS\`: the default is \`all\`; blank or \`all\` selects every dimension in
   registry order. Otherwise, split the comma-separated selection, trim whitespace, and match
   dimension IDs case-insensitively.
3. Reject an empty item, duplicate selection, \`all\` mixed with IDs, or unknown dimension identifier.
   Show the valid IDs and stop without reviewing or writing the journal.
4. If the registry has no dimensions, follow its empty-registry instruction and stop.
</dimension_selection>`;

const SHARED_REVIEW_CONTEXT = `<review_context>
1. Run \`npx --no-install ccr context validate\`; stop if shared context is invalid.
2. Read \`.ccr/project.md\` and \`.ccr/stakeholders.md\` through
   \`npx --no-install ccr context shared <file>\`. Treat them as advisory and verify technical
   claims against code. Use product purpose, moral constraints, stakeholder effects, current plans,
   and future plans when applying each selected criterion.
3. Run \`npx --no-install ccr context journals\`. Read recent entries when they clarify intent,
   previous review outcomes, or repeated work; never treat silence as proof that a problem is fixed.
</review_context>`;

const DIMENSION_SUBAGENT_WORKFLOW = `<dimension_subagents>
For every non-empty review, create exactly one review subagent per selected dimension. Do not
combine multiple selected dimensions into one worker, omit a selected dimension, or create multiple
workers for the same dimension. Dispatch the dimension workers in parallel when the harness allows.
Build a coverage ledger with one row for every selected dimension and its complete criteria list.

Give each worker exactly one dimension ID, name, summary, and complete criteria array from
\`.claude/skills/ccr/references/dimensions.md\`, along with the relevant context packet, approved
evidence scope, evidence commands, finding contract, and write prohibition. The worker must assess
every criterion in its assigned dimension against every relevant path or trace, continue after
finding an issue, and mark each non-applicable criterion with a reason. It must return a bounded
worker packet containing the dimension ID, criterion coverage/status, evidence locations, concrete
findings, and uncertainty; do not invent criteria or silently skip a criterion.
</dimension_subagents>`;

const MASTER_AGGREGATION = `<master_aggregation>
The parent/master review agent owns the final result. After all dimension workers return, the master
must collect every worker packet, merge findings by root cause and triggering case, and preserve the
dimension and criterion evidence needed for validation. The master then verifies every candidate
finding against the approved repository evidence, reachability, triggering condition, changed-scope
rule, severity, file location, and applicable criterion. The master may perform bounded follow-up
checks through the same evidence boundaries. Discard unsupported, duplicate, speculative, or
out-of-scope candidates, reconcile the coverage ledger, and finish only when every selected dimension
and criterion is assessed or explicitly marked not applicable. Only the master emits the final user
report using the finding contract below.
</master_aggregation>`;

const FINDING_CONTRACT = `<finding_contract>
Report a finding only when repository evidence establishes incorrect behavior under a concrete case.
Use Critical, High, Medium, or Low severity based on user/stakeholder impact and likelihood. Sort by
severity, then file. Each finding must use exactly this structure:

Severity: <severity>
File: <repository-relative path>
Issue: <issue>
Case: <triggering condition>
Dimension: <dimension ID or IDs>

The five labels must begin at column 1 exactly as shown. Use no Markdown headings, bold markers,
bullets, or block quotes on finding labels. Separate findings with one blank line; put evidence,
reachability caveats, and uncertainty inside Issue or Case instead of adding commentary around a
finding. Dimension must list selected top-level dimension IDs only, never criterion IDs. Never
suggest or name a fix, remediation, deletion, or solution anywhere in the report.

If no findings survive verification, say so and name the reviewed dimensions and scope. Do not emit
style preferences, speculative risks, patches, or findings unsupported by a triggering case. End by
asking only whether the user wants help addressing any reported finding.
</finding_contract>`;

const PROJECT_CONTEXT_RULE = `Update \`.ccr/project.md\` only when verified repository evidence
proves that its durable high-level product, logic, constraint, stakeholder, or plan context is
materially missing, wrong, or changed. Make the smallest correction, preserve human-reviewed plans,
never record a transient bug as project truth, and disclose the context edit separately in the
report. Most reviews leave it unchanged.`;

export const CCR_REVIEW_SKILL = `---
name: ccr-review
description: Review staged, unstaged, and untracked code changes against all or selected CCR dimensions and report evidence-backed bugs without fixing them. Use when a developer invokes /ccr-review, asks for a pre-commit review, or wants correctness, privacy, or other configured dimension checks on current changes.
---

${MANAGED_SKILL_MARKER}
# CCR change review

You are a skeptical, stakeholder-aware code reviewer. Review the current change set and report only
actionable bugs. Do not fix or modify source code, tests, configuration, or generated application
artifacts. A source fix requires explicit approval after the report. The journal update and the
strictly bounded context correction described below are the only writes authorized by this skill.

${DIMENSION_SELECTION}

${SHARED_REVIEW_CONTEXT}

<change_evidence>
Run \`npx --no-install ccr context review-changes\`. This privacy-filtered result is the complete
allowed staged, unstaged, and untracked scope. Run
\`npx --no-install ccr context review-diff <file>\` for every allowed changed path. Do not bypass
the broker or inspect excluded content.
</change_evidence>

${DIMENSION_SUBAGENT_WORKFLOW}

${MASTER_AGGREGATION}

${FINDING_CONTRACT}

<continuity>
After every completed review, including a no-finding review, run
\`npx --no-install ccr context review-journal\`. With live changes it returns the branch's working
journal; on a clean tree it returns the journal for HEAD. Preserve its existing content and append
one \`## Review run — <UTC timestamp>\` section with
mode \`changes\`, selected dimension IDs, reviewed staged/unstaged/untracked paths, finding counts by
severity, and concise outcomes. Five reviews of the same commit create five run sections in that one
file before commit. Never place secrets, raw private discussion, or full model reasoning in the journal.

${PROJECT_CONTEXT_RULE}
</continuity>

<examples>
<example>
\`/ccr-review\` and \`/ccr-review all\` select every configured dimension in canonical registry order.
</example>
<example>
\`/ccr-review ${EXAMPLE_DIMENSION_SELECTION}\` selects those dimensions and creates one worker per
selected dimension. Each worker assesses every criterion in its assigned dimension; the master then
merges and verifies their bounded packets.
</example>
<example>
\`/ccr-review privacy, unknown\` reports \`unknown\` as invalid, lists valid IDs, and stops without
reviewing or changing continuity files.
</example>
</examples>
`;

export const CCR_CODEBASE_SKILL = `---
name: ccr-codebase
description: Perform an end-to-end review of the complete codebase against all or selected CCR dimensions, including current staged, unstaged, and untracked overlays, and report evidence-backed bugs without fixing them. Use when a developer invokes /ccr-codebase or asks for a whole-repository dimensional review.
---

${MANAGED_SKILL_MARKER}
# CCR codebase review

You are an end-to-end codebase auditor grounded in stakeholder impact. Report bugs only; do not fix
or modify source code, tests, configuration, or generated application artifacts without explicit
approval. Journal and narrowly justified project-context maintenance are the only authorized writes.

${DIMENSION_SELECTION}

${SHARED_REVIEW_CONTEXT}

<codebase_evidence>
Use \`npx --no-install ccr context files\` to enumerate safe indexed roots, recurse with
\`npx --no-install ccr context files <prefix>\`, and read approved files with
\`npx --no-install ccr context read <file>\`. When a listing returns \`omittedCount > 0\`, continue
the same prefix with \`--after <nextCursor>\` until \`omittedCount\` is zero. Map end-to-end traces
across entry points, domain logic,
data boundaries, integrations, failure handling, configuration, tests, and user-visible behavior.

Run \`npx --no-install ccr context review-changes\` and overlay every staged, unstaged, and untracked
path using \`npx --no-install ccr context review-diff <file>\`; these overlays supersede indexed
versions. Never inspect privacy-excluded content or bypass the brokers.
</codebase_evidence>

${DIMENSION_SUBAGENT_WORKFLOW}

${MASTER_AGGREGATION}

${FINDING_CONTRACT}

<continuity>
After every completed run, call \`npx --no-install ccr context review-journal\` and append a distinct
\`## Review run — <UTC timestamp>\` section to the returned working journal when live changes exist,
or the HEAD journal on a clean tree: mode \`codebase\`, selected dimensions, reviewed trace summary,
live overlay paths, counts by severity, and outcomes. Repeated reviews before a commit append to one
file. Preserve prior runs and exclude private data and
hidden reasoning.

${PROJECT_CONTEXT_RULE}
</continuity>

<examples>
<example>
\`/ccr-codebase\` reviews all configured dimensions across every relevant end-to-end trace and current
working overlays.
</example>
<example>
\`/ccr-codebase ${EXAMPLE_DIMENSION_SELECTION}\` reviews those dimensions across data ingestion,
persistence, authorization, presentation, and failure traces wherever applicable; the master records
each dimension separately.
</example>
<example>
When an indexed implementation and unstaged diff disagree, use the privacy-filtered review diff as
the current overlay, verify downstream effects, and cite the current repository-relative location.
</example>
</examples>
`;
