/**
 * Shared per-issue review method embedded in every dimension subagent prompt.
 * Keep it product-agnostic; dimension-specific questions belong in `dimensions.json`.
 */
export const STAKEHOLDER_IMPACT_REVIEW_STANDARD = `Look for **ethical and inclusivity problems in how the product is designed to work**, not for code that
is broken or working. Focus on product rules, defaults, workflows, scoring, evaluation, assumptions or any other functionality of the code that could
unfairly affect students or other people impacted by the system. We are looking for **NON-TECHNICAL** bugs or issues related to **EHTICAL AND INCLUSIVITY**.

IMPORTANT: Ask of every candidate: **would this still harm someone if the code worked exactly as intended?**
If not, it is a technical bug. Skip it.

Do **not** report crashes, security holes, validation or error-handling gaps, race conditions, data loss,
performance, missing tests, or generic UX issues, even when students could be affected. A technical rule
counts only when, working as designed, it treats a legitimate person unfairly, such as a name field that
rejects apostrophes or a timed test with no way to request more time.

For each potential issue:

* Identify the specific rule or behavior in the code.
* Explain who could be negatively affected and in what realistic circumstance.
* Trace how the code could change their participation, opportunity, representation, or treatment.
* Check for safeguards, exceptions, or human correction before calling it a bug.

Be conservative. **Avoid false positives.** Do not assume harm from a label, missing feature, or lack of
demographic breakdown alone. Do not invent user experiences or disparities. If the evidence is
incomplete, report it as a question rather than a finding. **It is completely acceptable to find no
inclusivity bugs.**`;
