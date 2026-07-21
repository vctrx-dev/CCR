# Contributing to CCR

## Commit Conventions

Use conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `perf:`.
The commit hook enforces this. Use lowercase subjects.

## PR Checklist

- [ ] Typecheck passes (`npm run typecheck`)
- [ ] Tests pass (`npm test`)
- [ ] Lint passes (`npm run lint`)
- [ ] Build succeeds (`npm run build`)
- [ ] New code has tests
- [ ] Fixtures regenerated if prompts changed (`npm run fixture:refresh-all`)

## Development Workflow

1. Write a failing test first (TDD)
2. Implement the minimal code to make it pass
3. Commit with `test:` or `feat:` prefix
4. Run all tests before pushing

## Fixtures

PR fixtures go in `fixtures/prs/`. Response fixtures go in `fixtures/responses/`.
Use `npm run fixture:record` to capture a real PR, `npm run fixture:replay` to test against it.
