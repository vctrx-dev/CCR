/**
 * CCR's supported programmatic API. Import from `@vctrx/ccr` rather than deep source paths so
 * configuration, managed-artifact, evidence, review, and provider contracts can evolve safely.
 * CLI registration remains intentionally private; use the `ccr` binary for command-line workflows.
 */

export * from "./context/index.js";
export * from "./llm/index.js";
export * from "./review/index.js";
