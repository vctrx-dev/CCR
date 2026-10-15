/** Shared invocation contract: setup supplies the runtime for every installation method. */
export const SKILL_CLI_INVOCATION = `<ccr_runtime>
Setup has already installed CCR's self-contained runtime in this repository. Run every terminal
support command from the repository root using \`node .ccr/private/runtime/dist/cli/index.cjs\`.
Any \`ccr <arguments>\` examples below or in help output are shorthand: replace only the initial
\`ccr\` with that exact Node invocation and preserve all arguments. For example, read resolved
configuration with \`node .ccr/private/runtime/dist/cli/index.cjs config --resolved\`. For nested
help, append \`--help\` to the command, for example
\`node .ccr/private/runtime/dist/cli/index.cjs context review-state --help\`.
Do not search PATH for CCR, probe global CCR packages, invoke a package runner, or ask the developer to install CCR.
The runtime works without a project dependency, a global installation, or the setup runner's cache.
Execute the runtime as support; exclude its generated bundle from product discovery and evidence.
For Git hooks, resolve this repository's runtime to an absolute path and quote it in the hook's
native language; never retain a temporary setup path. Use the same runtime for both hook events.
Quote free-form text and selections as single shell arguments. Prefer an argument-array process
API when available; never interpolate user text into executable shell syntax. Do not pass literal
angle-bracket placeholders, optional-argument brackets, or pipe-separated choices to commands.
The requested operation authorizes its documented managed writes; show and apply the diff without
another installation or routine write-approval question. Ask only for missing product context,
ambiguous arguments, or a real ownership/path conflict.
Domain selection, hook reconciliation, validation, journal creation, and assessment are required
parts of initialization. Perform them locally; never skip them because a shell command named CCR
is absent. If a required local resource is actually missing or unreadable, identify that exact file
and report incomplete initialization. Do not invent a package-install prerequisite or claim success.
</ccr_runtime>`;
