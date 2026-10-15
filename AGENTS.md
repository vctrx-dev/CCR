# CCR Purpose

CCR discovers **unknown unknowns**: ethical and inclusivity bugs hidden in product assumptions,
rules, wording, and code—even when software works as intended.

It explains who is affected and how, in non-technical language backed by code or product-rule
evidence. Its focus is exclusion, unfair treatment, harmful assumptions, and lost privacy, learning,
or human control—not ordinary engineering defects without a supported human consequence.

# Testing policy

Keep tests small and focused on user-visible behavior and meaningful data-safety risks. Reuse or
extend an existing scenario before adding another test file. Keep one primary check per risk;
avoid repeating the same assertion across unit, integration, CLI, and package tests.

Do not add tests for prose, formatting, constants, type-only wrappers, straightforward forwarding,
or reversible low-impact changes. Do not write tests just to mirror implementation, match every
source filename, exercise every possible argument combination, or meet a coverage percentage.
Add a regression test when a real behavior or safety bug needs protection, using the narrowest
scenario that would have caught it. Preserve tests for privacy, destructive cleanup, ownership,
and review/journal integrity when changing those boundaries.

Run the smallest relevant checks while editing. Run the compact full suite and package smoke for
release-facing changes; coverage is an optional diagnostic. Keep the routine suite near its current
maintenance budget of roughly 100 cases and 2,200 lines, rather than growing it after every edit.
This is a budget to stay below when practical, not a target to fill.
