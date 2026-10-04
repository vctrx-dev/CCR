/**
 * Renders product-level help. Direct users to the live JSON command instead of embedding IDs
 * captured when the CLI was built or started.
 */
export function renderProductHelp(): string {
  return `
Terminal commands:
  ccr -v | -version | --version                    Print installed CCR version
  ccr setup [--dry-run] [--json]                    Install or refresh CCR assets
  ccr update [--dry-run] [--json]                   Safely refresh package-managed CCR assets
  ccr uninstall [--dry-run] [--remove-context]      Remove integration; preserve context by default
  ccr context <command>                          Inspect human-impact context and review-safe evidence
  ccr context save-review <scope> <dimensions> <counts> <summary>
                                                 Save a finished review to its journal
  ccr context append-decision <decision>         Append one config-authorized decision
  ccr context assess <code-fingerprint> <context-fingerprint> <summary>
                                                  Record an evidence-bound context assessment
  ccr context journals [PR-<number>]             Read repository-wide recent journals except the active one
  ccr context dimensions [--json]               Read live repository taxonomy and render review lenses
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
                                                   Manage evidence-backed product context
  /ccr-hooks <sync|status|remove>                  Manage repository-native hooks
  /ccr-review [changes|codebase|PR-<number>]       Review stakeholder impact in changes, codebase, or a PR
             [all|dimension [<id> ...]|<id> ...]

Current dimension IDs and criteria: ccr context dimensions --json.
JSON is read on every call: repository source, customized .ccr JSON, then current package defaults.
Blank review arguments default to changes and all dimensions. Add codebase or PR-<number> for
another scope. Select one or more dimension IDs separated by spaces or commas; dimension is an
optional prefix. Use dimension without IDs to list available dimensions and choose which to review.
Example: /ccr-review codebase dimension.
`;
}
