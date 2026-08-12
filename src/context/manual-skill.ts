import { MANAGED_SKILL_MARKER } from "./skill-marker";

export const CCR_MANUAL_SKILL = `---
name: ccr
description: Explain CCR's installed commands, skills, safety boundaries, and current scope. Use when a developer asks how CCR works, what to run, or what CCR changes.
---

${MANAGED_SKILL_MARKER}
# CCR manual

CCR is an opt-in repository-context package:

- \`/ccr-context\` initializes, updates, verifies, adds to, or compacts context.
- \`/ccr-hooks\` synchronizes advisory hooks using the repository's own conventions.
- \`/ccr-review [all|dimension,...]\` reviews current changes without fixing them.
- \`/ccr-codebase [all|dimension,...]\` reviews the complete codebase without fixing it.
- \`npx --no-install ccr config init --apply\` creates human-owned settings.
- \`npx --no-install ccr setup --apply\` installs skills and context skeletons. It does not design
  or install hooks; \`/ccr-hooks sync\` does that after inspecting the repository.
- \`npx --no-install ccr uninstall\` previews bounded removal.

Explain only the requested topic. Arguments are not context operations. CCR never commits or pushes,
and generated context remains subordinate to source, tests, schemas, and explicit human decisions.
`;
