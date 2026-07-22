# Security Policy

## Reporting a Vulnerability

CCR processes code reviews and may send code snippets to LLM providers.
If you discover a security vulnerability, please report it privately.

**Do not report security vulnerabilities through public GitHub issues.**

Instead, email the maintainers directly or open a GitHub Security Advisory
at https://github.com/vctrx-dev/CCR/security/advisories/new.

Please include:
- Type of issue (e.g., API key leakage, prompt injection, data exposure)
- Steps to reproduce
- Affected versions
- Any potential impact

You should receive a response within 48 hours. If you don't, follow up.

## Scope

The following are in scope:
- Authentication or credential leakage
- Prompt injection that exfiltrates data
- Unauthorized access to review data
- Supply chain attacks via dependencies

The following are out of scope:
- LLM model-level vulnerabilities (report to the model provider)
- General AI safety concerns unrelated to CCR's data handling

## Preferred Languages

English, please.
