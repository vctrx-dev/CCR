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
  ccr update [--apply] [--dry-run] [--json]         Safely refresh package-managed CCR assets
  ccr uninstall [--apply] [--remove-context]
  ccr context <command>                          Inspect context and review-safe evidence
  ccr context append-decision <decision>         Append one config-authorized decision
  ccr context journals [PR-<number>]             Read bounded recent branch or PR journals
  ccr context review-pr PR-<number>              Read bounded privacy-filtered PR evidence
  ccr context review-pr-head PR-<number> <files...> Read approved PR head files
  ccr config [validate|defaults|init]             Read, validate, or initialize settings
  ccr config set <key> <value> [--apply]          Preview or apply one setting
  ccr hooks <status|uninstall|pre-commit|post-commit> Inspect or run advisory hook operations

  Run npx --no-install ccr help <command> for nested commands, arguments, and options.

Claude Code skills (run inside Claude Code after setup):
  /ccr [question]                                  Answer CCR usage questions
  /ccr-context <initialize|update|verify|addition|compact>
                                                   Manage repository context
  /ccr-hooks <sync|status|remove>                  Manage repository-native hooks
  /ccr-review [changes|codebase|PR-<number>]       Review changes, codebase, or a PR; report only
             [all|dimension,...]

Configured dimension IDs: ${configuredDimensions}
Blank review arguments default to changes and all dimensions. Add codebase or PR-<number> for
another scope, then separate multiple dimension IDs with commas.
`;
}
