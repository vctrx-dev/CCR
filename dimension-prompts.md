You lead an inclusivity review of this repository. Do not change any files.

Scope: the whole codebase, including uncommitted changes.

1. Start one subagent for each of the 7 dimension prompts below, all at once in a single message.
   Give each its prompt exactly as written, plus the scope. Tell each one it must not edit anything.
2. Go through what they find. Double-check each finding in the code, merge duplicates, and turn
   anything uncertain into a question. Drop anything that is really a technical bug (crashes, security,
   validation, error handling, performance) rather than an unfair design choice.
3. Share the results in the same output format, most severe first, and tag each finding with its
   dimension, like **Finding [High; Inclusion]:**. If nothing survives, say
   **No supported inclusivity bugs found.**

## Subagent prompt 1: Fairness Evaluation — Whose Benefit Counts

````
Review the current codebase for **inclusivity bugs** related to the dimension below.

This software is used in education. Learn what it does and who uses it from the README,
documentation, and source. Consider not only the people using the system
directly, but also the **students and other learners who may ultimately be affected by its outputs,
decisions, and evaluation choices**.

Look for **ethical and inclusivity problems in how the product is designed to work**, not for code that
is broken. Focus on product rules, defaults, workflows, scoring, evaluation, or assumptions that could
unfairly affect students or other people impacted by the system.

Ask of every candidate: **would this still harm someone if the code worked exactly as intended?**
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
inclusivity bugs.**

### Dimension: Fairness Evaluation — Whose Benefit Counts

Review the code through these questions:

1. **What counts as benefit?**
   What evidence or signals are used to decide that the system's content, recommendations, assessments, or other outputs are successful, suitable, or beneficial? Could that signal look successful while some students lose out?

2. **Whose experience counts?**
   Whose experiences or feedback influence evaluation, and are any affected students systematically filtered out, represented by others, or given less weight?

3. **Can better averages hide worse opportunities?**
   Could aggregated success measures or comparisons hide meaningfully worse outcomes for students in particular circumstances?

4. **Can contrary evidence change practice?**
   If students, instructors, or others provide credible evidence that something is not working fairly, is there a meaningful way for that evidence to affect how the system or its outputs are judged or used?

### Output

For supported bugs:

**Finding [severity]:** in plain, non-technical language, who is treated unfairly and how
**Scenario:** one realistic or hypothetical example
**Evidence:** relevant file/path, function, rule, or code behavior

For uncertain issues:

**Question:** what needs to be established before this can be considered an inclusivity bug
**Context:** the relevant code behavior and why it may matter

If no supported findings exist, say:

**No supported inclusivity bugs found.**

Do not propose fixes unless asked.
````

## Subagent prompt 2: Pedagogy — Defensible Learning Rather Than Convenient Automation

````
Review the current codebase for **inclusivity bugs** related to the dimension below.

This software is used in education. Learn what it does and who uses it from the README,
documentation, and source. Consider not only the people using the system
directly, but also the **students and other learners who may ultimately be affected by its outputs,
decisions, and evaluation choices**.

Look for **ethical and inclusivity problems in how the product is designed to work**, not for code that
is broken. Focus on product rules, defaults, workflows, scoring, evaluation, or assumptions that could
unfairly affect students or other people impacted by the system.

Ask of every candidate: **would this still harm someone if the code worked exactly as intended?**
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
inclusivity bugs.**

### Dimension: Pedagogy — Defensible Learning Rather Than Convenient Automation

Review the code through these questions:

1. **Is source material treated as neutral truth?**
   When source material becomes lessons, assessments, answer keys, or feedback, is it treated as unquestionable? Could a perspective, omission, or contested claim in the source become the standard students are judged against?

2. **Is answerability favored over learning?**
   Do defaults favor content or tasks that are easiest to produce, score, or compare over the intended learning goal? Could recall or literal matching quietly replace reasoning, application, or interpretation?

3. **Is understanding reduced to one form of expression?**
   Does the system accept only one answer form, wording, language register, or interaction style as evidence of understanding? Could a student who understands the material be marked wrong for expressing it differently?

4. **Can learning judgments be revisited?**
   Can generated content, a grade, feedback, or another learning judgment become final before instructors or students can understand, question, or correct it?

5. **Does reused content keep its context?**
   When generated content is saved and reused, does it keep the learning goal, source, limitations, and human review needed to use it responsibly in a different course or setting?

### Output

For supported bugs:

**Finding [severity]:** in plain, non-technical language, who is treated unfairly and how
**Scenario:** one realistic or hypothetical example
**Evidence:** relevant file/path, function, rule, or code behavior

For uncertain issues:

**Question:** what needs to be established before this can be considered an inclusivity bug
**Context:** the relevant code behavior and why it may matter

If no supported findings exist, say:

**No supported inclusivity bugs found.**

Do not propose fixes unless asked.
````

## Subagent prompt 3: Decision Fairness — Justified and Contestable Allocation of Burden

````
Review the current codebase for **inclusivity bugs** related to the dimension below.

This software is used in education. Learn what it does and who uses it from the README,
documentation, and source. Consider not only the people using the system
directly, but also the **students and other learners who may ultimately be affected by its outputs,
decisions, and evaluation choices**.

Look for **ethical and inclusivity problems in how the product is designed to work**, not for code that
is broken. Focus on product rules, defaults, workflows, scoring, evaluation, or assumptions that could
unfairly affect students or other people impacted by the system.

Ask of every candidate: **would this still harm someone if the code worked exactly as intended?**
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
inclusivity bugs.**

### Dimension: Decision Fairness — Justified and Contestable Allocation of Burden

Review the code through these questions:

1. **Do decisions rely on unexamined proxies?**
   Does any rule about eligibility, placement, priority, scoring, or access treat a proxy, default category, or past outcome as evidence about a student? Could circumstance or history be mistaken for ability, risk, or need?

2. **Who carries the burden by default?**
   When something goes wrong, who must notice it, supply extra proof, wait, or absorb the cost? Do defaults, deadlines, or recovery routes place that burden unequally on students or instructors in particular circumstances?

3. **Can affected people question the outcome?**
   Can the system, an instructor, or an administrator decide an outcome that affects students while those students have no way to see, question, or correct it?

4. **Can fairness claims be examined?**
   Where the system presents an outcome as fair, neutral, objective, or validated, can the people applying or affected by it examine the basis and limits of that claim?

### Output

For supported bugs:

**Finding [severity]:** in plain, non-technical language, who is treated unfairly and how
**Scenario:** one realistic or hypothetical example
**Evidence:** relevant file/path, function, rule, or code behavior

For uncertain issues:

**Question:** what needs to be established before this can be considered an inclusivity bug
**Context:** the relevant code behavior and why it may matter

If no supported findings exist, say:

**No supported inclusivity bugs found.**

Do not propose fixes unless asked.
````

## Subagent prompt 4: Inclusion — Whose Circumstances the Product Treats as Normal

````
Review the current codebase for **inclusivity bugs** related to the dimension below.

This software is used in education. Learn what it does and who uses it from the README,
documentation, and source. Consider not only the people using the system
directly, but also the **students and other learners who may ultimately be affected by its outputs,
decisions, and evaluation choices**.

Look for **ethical and inclusivity problems in how the product is designed to work**, not for code that
is broken. Focus on product rules, defaults, workflows, scoring, evaluation, or assumptions that could
unfairly affect students or other people impacted by the system.

Ask of every candidate: **would this still harm someone if the code worked exactly as intended?**
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
inclusivity bugs.**

### Dimension: Inclusion — Whose Circumstances the Product Treats as Normal

Review the code through these questions:

1. **Is one cultural framing treated as universal?**
   Do learning content, examples, categories, or correctness rules assume one cultural context or reduce people to a fixed group identity? Could that change what counts as correct, relevant, or normal for some students?

2. **Who does participation assume?**
   Does using the system or its outputs require a particular name format, language, schedule, device, connectivity, or resource level that a legitimate instructor or student may not have?

3. **Can people with access needs complete the task?**
   Can someone using a keyboard, screen reader, alternative format, or accommodation complete a consequential task, such as submitting work, taking an assessment, or reviewing feedback? Is an equivalent route available?

4. **Who can recover when things go wrong?**
   After someone is rejected, misunderstood, delayed, or given unsuitable output, who can realistically recover? Does correction depend on time, expertise, or authority that some people lack?

### Output

For supported bugs:

**Finding [severity]:** in plain, non-technical language, who is treated unfairly and how
**Scenario:** one realistic or hypothetical example
**Evidence:** relevant file/path, function, rule, or code behavior

For uncertain issues:

**Question:** what needs to be established before this can be considered an inclusivity bug
**Context:** the relevant code behavior and why it may matter

If no supported findings exist, say:

**No supported inclusivity bugs found.**

Do not propose fixes unless asked.
````

## Subagent prompt 5: Transparency — Understandable and Accountable Product Authority

````
Review the current codebase for **inclusivity bugs** related to the dimension below.

This software is used in education. Learn what it does and who uses it from the README,
documentation, and source. Consider not only the people using the system
directly, but also the **students and other learners who may ultimately be affected by its outputs,
decisions, and evaluation choices**.

Look for **ethical and inclusivity problems in how the product is designed to work**, not for code that
is broken. Focus on product rules, defaults, workflows, scoring, evaluation, or assumptions that could
unfairly affect students or other people impacted by the system.

Ask of every candidate: **would this still harm someone if the code worked exactly as intended?**
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
inclusivity bugs.**

### Dimension: Transparency — Understandable and Accountable Product Authority

Review the code through these questions:

1. **Is consequential logic hidden?**
   Do grades, recommendations, generated content, or other evaluations rely on rules, sources, or decisions that the instructors or students affected by them cannot see?

2. **Does the system overstate what it knows?**
   Does the system present generated content or evaluations as correct, complete, fair, or ready when they are really inferences, automated guesses, or contested judgments?

3. **Do people have enough context to judge automated output?**
   When an instructor must act on an automated score, flag, or recommendation, do they receive the evidence, limits, and uncertainty needed to judge it responsibly?

4. **Is there recourse for affected people?**
   Can an automated or instructor-applied judgment shape a student's learning, grade, or opportunity while the student has no way to understand, contest, or add context to it?

5. **Can human review actually change the outcome?**
   Does a human review step have the information, time, and authority to change an output before it is used, or does it only rubber-stamp it?

6. **Is provenance kept for later use?**
   Can content or decisions be reused, relied on, or challenged later without a record of its source, revisions, and human involvement?

### Output

For supported bugs:

**Finding [severity]:** in plain, non-technical language, who is treated unfairly and how
**Scenario:** one realistic or hypothetical example
**Evidence:** relevant file/path, function, rule, or code behavior

For uncertain issues:

**Question:** what needs to be established before this can be considered an inclusivity bug
**Context:** the relevant code behavior and why it may matter

If no supported findings exist, say:

**No supported inclusivity bugs found.**

Do not propose fixes unless asked.
````

## Subagent prompt 6: Privacy — Purpose, Agency, and Durable Control Over Personal Context

````
Review the current codebase for **inclusivity bugs** related to the dimension below.

This software is used in education. Learn what it does and who uses it from the README,
documentation, and source. Consider not only the people using the system
directly, but also the **students and other learners who may ultimately be affected by its outputs,
decisions, and evaluation choices**.

Look for **ethical and inclusivity problems in how the product is designed to work**, not for code that
is broken. Focus on product rules, defaults, workflows, scoring, evaluation, or assumptions that could
unfairly affect students or other people impacted by the system.

Ask of every candidate: **would this still harm someone if the code worked exactly as intended?**
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
inclusivity bugs.**

### Dimension: Privacy — Purpose, Agency, and Durable Control Over Personal Context

Review the code through these questions:

1. **Is personal information collected for a clear purpose?**
   Is personal, student, or inferred information collected or used without a clear connection to the purpose communicated to the people it describes?

2. **Is information used beyond reasonable expectations?**
   Is personal information repurposed into a new evaluation, ranking, recommendation, or disclosure that the person could not reasonably anticipate or influence?

3. **Who can see and control personal information?**
   Can an institution, instructor, or other privileged role see, combine, or act on someone's information while that person cannot know about, correct, or limit that use?

4. **Does old information keep shaping decisions?**
   Can past personal information, history, or labels keep influencing decisions after their purpose, accuracy, or context has changed?

### Output

For supported bugs:

**Finding [severity]:** in plain, non-technical language, who is treated unfairly and how
**Scenario:** one realistic or hypothetical example
**Evidence:** relevant file/path, function, rule, or code behavior

For uncertain issues:

**Question:** what needs to be established before this can be considered an inclusivity bug
**Context:** the relevant code behavior and why it may matter

If no supported findings exist, say:

**No supported inclusivity bugs found.**

Do not propose fixes unless asked.
````

## Subagent prompt 7: System Integrity — Durable Stakeholder Outcomes and Institutional Accountability

````
Review the current codebase for **inclusivity bugs** related to the dimension below.

This software is used in education. Learn what it does and who uses it from the README,
documentation, and source. Consider not only the people using the system
directly, but also the **students and other learners who may ultimately be affected by its outputs,
decisions, and evaluation choices**.

Look for **ethical and inclusivity problems in how the product is designed to work**, not for code that
is broken. Focus on product rules, defaults, workflows, scoring, evaluation, or assumptions that could
unfairly affect students or other people impacted by the system.

Ask of every candidate: **would this still harm someone if the code worked exactly as intended?**
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
inclusivity bugs.**

### Dimension: System Integrity — Durable Stakeholder Outcomes and Institutional Accountability

Review the code through these questions:

1. **Do outcomes depend on invisible assumptions?**
   Does a consequential outcome silently depend on a resource, authority, timing, or institutional practice that affected people cannot see or reasonably meet?

2. **Can harmful patterns be noticed?**
   Could the system repeatedly produce the same adverse outcome for students or instructors while no responsible person can recognize the pattern or its source?

3. **Does correction compound inequality?**
   Does correcting a harmful outcome or default depend on time, authority, expertise, or access that affected people do not equally have, and could that cost repeat?

4. **Is someone accountable for automated outcomes?**
   Can automation create a consequential outcome while responsibility for judging, correcting, and owning its effects is split so that no role owns it?

5. **Do boundary rules decide who is protected?**
   Do rules about trusted parties, acceptable input, or exceptions decide whose safety, privacy, or opportunity is protected, and do they favor one role over another?

6. **Who loses out when capacity is limited?**
   When access, time, processing, or support is limited, who waits, loses access, or receives lower-quality output, and is that allocation justified?

7. **Do adverse outcomes lose their meaning?**
   Does the system turn a consequential adverse outcome into an isolated or normalized event that affected people and responsible roles cannot recognize or learn from?

8. **Do different roles see conflicting rules?**
   Do different roles, screens, or handoffs apply incompatible versions of a consequential rule or responsibility, leaving affected people to bear the result?

### Output

For supported bugs:

**Finding [severity]:** in plain, non-technical language, who is treated unfairly and how
**Scenario:** one realistic or hypothetical example
**Evidence:** relevant file/path, function, rule, or code behavior

For uncertain issues:

**Question:** what needs to be established before this can be considered an inclusivity bug
**Context:** the relevant code behavior and why it may matter

If no supported findings exist, say:

**No supported inclusivity bugs found.**

Do not propose fixes unless asked.
````
