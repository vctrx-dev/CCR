import { REVIEW_DIMENSIONS } from "../review/dimensions";

/**
 * Renders the product-level help appended to Commander's terminal command list. Review dimension
 * IDs come from the validated registry so taxonomy edits require no CLI implementation changes.
 */
export function renderProductHelp(): string {
  const dimensionIds = REVIEW_DIMENSIONS.dimensions.map(({ id }) => id).join(", ");
  const configuredDimensions = dimensionIds || "none";
  return `
Terminal commands:
  ccr setup [--apply] [--dry-run] [--json]
  ccr uninstall [--apply] [--remove-context]
  ccr context <command>                          Inspect context and review-safe evidence
  ccr config [validate|defaults|init]             Read, validate, or initialize settings
  ccr config set <key> <value> [--apply]          Preview or apply one setting
  ccr hooks <status|uninstall|pre-commit|post-commit> Inspect or run advisory hook operations

  Run npx --no-install ccr help <command> for nested commands, arguments, and options.

Claude Code skills (run inside Claude Code after setup):
  /ccr [question]                                  Answer CCR usage questions
  /ccr-context <initialize|update|verify|addition|compact>
                                                   Manage repository context
  /ccr-hooks <sync|status|remove>                  Manage repository-native hooks
  /ccr-review [all|dimension,...]                  Review current changes; report only
  /ccr-codebase [all|dimension,...]                Review the whole codebase; report only

Configured dimension IDs: ${configuredDimensions}
Blank review arguments default to all dimensions. Separate multiple IDs with commas.
`;
}
