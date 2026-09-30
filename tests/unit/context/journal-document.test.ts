import { describe, expect, it } from "vitest";
import { isCompletedCommitJournal } from "../../../src/context/journal-document";

const COMMIT = "a".repeat(40);
const STARTED = "2026-09-30T10:00:00Z";

function journal(outcomes: string): string {
  return `# CCR Journal

- **Started**: ${STARTED}
- **Updated**: ${STARTED}
- **Branch**: \`dev\`
- **Commit**: \`${COMMIT}\`

## Summary

Reviewed submission access and corrected the keyboard barrier.

## Findings and outcomes

${outcomes}`;
}

describe("completed commit journal", () => {
  it("accepts substantive findings without empty disposition categories", () => {
    expect(
      isCompletedCommitJournal(
        journal("- F1 — Fixed and verified: keyboard users can now submit their work."),
        COMMIT,
        STARTED,
      ),
    ).toBe(true);
  });

  it("rejects missing outcomes even when later sections have content", () => {
    expect(
      isCompletedCommitJournal(
        journal("## Next steps\n\nCheck submission access."),
        COMMIT,
        STARTED,
      ),
    ).toBe(false);
  });

  it("continues accepting legacy journals", () => {
    expect(
      isCompletedCommitJournal(
        journal(
          "- Addressed: submission access.\n- Deferred: none.\n- Questioned: none.\n- Rejected: none.",
        ),
        COMMIT,
        STARTED,
      ),
    ).toBe(true);
  });
});
