# CCR — Critical Code Reviewer

[![CI](https://github.com/vctrx-dev/CCR/actions/workflows/ci.yml/badge.svg)](https://github.com/vctrx-dev/CCR/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/%40ccr%2Freviewer)](https://www.npmjs.com/package/@ccr/reviewer)
[![License](https://img.shields.io/github/license/vctrx-dev/CCR)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D24-brightgreen)](.node-version)

LLM-powered code review focused on **educational AI fairness, inclusion, transparency, and governance**. Runs as a GitHub Action, CLI tool, or programmatic API.

## Install

```bash
npm install @ccr/reviewer
# or
npx @ccr/reviewer review --help
```

## Usage

**GitHub Action** — add to `.github/workflows/ccr-review.yml`:

```yaml
- uses: vctrx-dev/CCR@v0
  with:
    api-key: ${{ secrets.ASU_API_KEY }}
    criteria: explainability,ai-governance,privacy-consent
```

**CLI**:

```bash
ccr review --pr https://github.com/owner/repo/pull/123
ccr review --local --criteria explainability,ai-governance
```

**API**:

```typescript
import { runReview } from "@ccr/reviewer";

const result = await runReview({
  files: changedFiles,
  criteria: ["explainability", "ai-governance"],
});
```

## Criteria

CCR reviews code against educational AI fairness criteria:

| Criterion | Focus |
|---|---|
| **Explainability** | Is the AI's decision-making transparent? |
| **AI Governance** | Does the code follow AI safety policies? |
| **Privacy & Consent** | Are user data and consent respected? |
| **Bias & Fairness** | Are there fairness concerns in training or inference? |
| **Accountability** | Is there human oversight of AI decisions? |

## Development

```bash
git clone https://github.com/vctrx-dev/CCR.git
cd CCR
pnpm install
pnpm run typecheck
pnpm run build
pnpm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines and [AGENTS.md](AGENTS.md) for codebase conventions.

## License

MIT — see [LICENSE](LICENSE).
