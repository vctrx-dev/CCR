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
  ccr -v | -version | --version                    Print installed CCR version
  ccr setup [--dry-run] [--json]                    Install or refresh CCR assets
  ccr update [--dry-run] [--json]                   Safely refresh package-managed CCR assets
  ccr uninstall [--dry-run] [--remove-context]      Remove integration; preserve context by default
  ccr context <command>                          Inspect context and review-safe evidence
  ccr context append-decision <decision>         Append one config-authorized decision
  ccr context journals [PR-<number>]             Read bounded recent branch or PR journals
  ccr context review-pr PR-<number>              Read bounded privacy-filtered PR evidence
  ccr context review-pr-head PR-<number> <files...> Read approved PR head files
  ccr config [validate|defaults]                  Read or validate settings and defaults
  ccr config init [--dry-run]                    Create or upgrade editable settings
  ccr config set <key> <value> [--dry-run]       Update one setting
  ccr hooks uninstall [--dry-run]                Remove legacy advisory hook blocks
  ccr hooks <status|pre-commit|post-commit>       Inspect or run advisory hook operations

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
