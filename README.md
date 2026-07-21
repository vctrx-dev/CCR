# CCR — Critical Code Reviewer

LLM-powered code review focused on educational AI fairness, inclusion, transparency, and governance. Runs as a GitHub Action, CLI tool, or programmatic API for agent tools (Claude Code, Codex).

## Quick Start

```bash
npx @ccr/reviewer review --pr https://github.com/owner/repo/pull/123
```

## Usage

- **GitHub Action** — add to `.github/workflows/ccr-review.yml` (see [action.yml](action.yml))
- **CLI** — `ccr review [options]` with `--pr <url>`, `--local`, or `--fixture <id>`
- **API** — `import { runReview } from '@ccr/reviewer'`

## Development

```bash
npm ci
npm run typecheck
npm run build
npm test
```

## License

MIT
