export default {
  extends: [],
  rules: {
    "type-enum": [2, "always", ["feat", "fix", "chore", "docs", "refactor", "test", "perf"]],
    "type-case": [2, "always", "lower-case"],
    "subject-case": [2, "always", "lower-case"],
    "subject-empty": [2, "never"],
    "type-empty": [2, "never"],
  },
};
