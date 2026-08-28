/**
 * Shared argument-normalization contract for every shipped Claude Code skill. Extend spelling
 * behavior here so context, hooks, review, and support cannot drift into different safety rules.
 */
export const SKILL_ARGUMENT_NORMALIZATION = `<argument_spelling>
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
</argument_spelling>`;
