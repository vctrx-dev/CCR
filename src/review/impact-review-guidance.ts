/**
 * Shared prompt guidance for every CCR review surface. Keep stakeholder-impact policy and its
 * examples here so the orchestrating skill and generated taxonomy cannot drift into code auditing.
 * Extend this file when the review philosophy changes; keep scope mechanics in `skills.ts`.
 */

export const STAKEHOLDER_IMPACT_REVIEW_STANDARD = `<stakeholder_impact_review>
CCR performs a socio-technical stakeholder-impact review, not a conventional code-quality, security,
reliability, performance, or UI audit. The subject is the product's decision-making behavior: hidden
assumptions about whose knowledge counts, how authority and burden are distributed, who can understand
or challenge an outcome, and whether harmful patterns can persist unseen.

Use code, configuration, tests, product context, and history as evidence of product behavior; do not
turn an ordinary implementation defect into a stakeholder finding by attaching generic harm language.
A candidate qualifies only when repository evidence establishes a consequential product assumption,
policy, authority relationship, feedback-loop gap, or distribution of benefit/burden. It can be a
finding even when every component works as designed. A standalone technical, security, UX, availability,
or platform-compatibility defect is out of scope unless the evidence proves that it creates a distinct
harm under a selected dimension beyond ordinary inconvenience or operational failure.

Use this rejection test: remove the target product's people, domain, and consequential decisions. If
the same candidate still reads as a generic uploader, dashboard, API, or implementation bug, discard it.

Start each dimension by mapping affected roles and relationships from the repository context. Consider
whose perspective is treated as neutral, whose circumstances become an exception, what the product
optimizes, who can question or correct a consequential outcome, and whether repeated use can conceal or
compound unequal effects. Do not invent protected groups, legal duties, learner outcomes, or product
requirements absent repository evidence. Missing capability is a finding only when the implemented
product makes or relies on a consequential decision and the gap creates an evidenced loss of agency,
fairness, learning quality, privacy, or accountability.

Every surviving finding must state: affected people or roles; the product behavior or assumption; a
credible, repository-grounded harm pathway; evidence and material uncertainty; and a concrete scenario.
Reject candidates that are merely bug reports, generic best-practice gaps, speculative social theory, or
technical failures rewritten in stakeholder language.
</stakeholder_impact_review>`;

export const STAKEHOLDER_IMPACT_REFERENCE = `
## Stakeholder-impact review contract

CCR is a socio-technical stakeholder-impact review, not a conventional technical, security, UX, or
reliability audit. Use repository evidence to identify consequential product assumptions, authority
relationships, distributions of burden or benefit, and missing feedback or correction loops. A finding
may exist even when every implementation component works as designed.

Do not turn an ordinary bug into a stakeholder finding by changing its wording. A technical defect is
outside this taxonomy unless repository evidence proves a distinct product-level harm under a selected
dimension. Every finding needs affected people or roles, the product behavior or assumption, a credible
harm pathway, evidence with uncertainty, and a concrete stakeholder scenario. Do not invent protected
groups, legal duties, or outcomes the repository does not establish.
`;

export const REVIEW_REASONING_EXAMPLES = `<review_examples>
Use these examples as reasoning patterns, not as assumptions about the reviewed repository:

<example>
An educational assessment product turns uploaded source material into questions. Repository evidence
shows no product concept for source perspective, contested claims, provenance, or missing viewpoints.
The product may treat one source's worldview as neutral assessment authority, so learners can be graded
against a framing they cannot see or contest. This can be a pedagogy, decision-fairness, transparency,
or inclusion finding even when ingestion, generation, review, and scoring all work correctly.
</example>
<example>
Generation accepts source material and requested counts/types but has no repository-supported learning
objective, reasoning level, or evidence-of-understanding constraint. The product may optimize for
questions easiest to derive and score rather than defensible learning, favoring recall or source wording
over interpretation and transfer. Report the embedded educational decision and credible affected roles,
not an imagined model defect.
</example>
<example>
An automated assessment workflow includes human approval but records no outcome feedback that could
reveal whether recurring question patterns are disproportionately confusing, inaccessible, or harmful
across relevant contexts. The product can work exactly as designed while responsible people cannot
discover unequal effects that emerge only across months, classes, or cohorts. This is a governance and
feedback-loop finding, not a request to collect unnecessary sensitive attributes.
</example>
<example>
An educator can approve an automated assessment, but affected learners cannot see why an answer is
considered correct, identify ambiguity, or seek correction. The product may place the burden of
contesting a consequential judgment on the person with least authority. This is a decision-fairness,
transparency, inclusion, or pedagogy finding when the repository establishes that the assessment has
such consequences.
</example>
<example>
A CSV filename sanitizer does not handle Windows reserved names. That is a conventional compatibility
defect. Reject it unless repository evidence shows that the product's decision logic uses this behavior
to impose a distinct stakeholder-level exclusion, authority imbalance, or persistent unequal outcome.
</example>
</review_examples>`;
