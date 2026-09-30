import { expect, it } from "vitest";
import { formatJournalEvidence } from "../../../src/context/journal-entry";

it("should prioritize living outcomes over obsolete findings inside a review run", () => {
  const content = `# CCR Journal\n\n## Summary\nCurrent account.\n\n## Findings and outcomes\nF1 fixed-and-verified: keyboard access restored.\n\n## Work and decisions\n${"history\n".repeat(650)}\n## Review run — 2026-09-01T12:00:00Z\n- **Scope**: changes\n\n### Findings and outcomes\nF1 open: keyboard access blocked.\n`;
  const evidence = formatJournalEvidence(content);
  expect(evidence).toContain("F1 fixed-and-verified");
  expect(evidence).not.toContain("F1 open");
});

it("should not replace current outcomes with a copied historical continuation", () => {
  const content = `# CCR Journal\n\n## Summary\nCurrent work.\n\n## Findings and outcomes\nFixed and verified: keyboard submission.\n\n## Work and decisions\n${"supporting history\n".repeat(400)}\n## Continuation\nEarlier work: .ccr/journal/main/2026-08-20.md\n\n### Summary\nPrior work.\n\n### Findings and outcomes\nOpen: keyboard submission.\n`;
  const evidence = formatJournalEvidence(content);
  expect(evidence).toContain("Fixed and verified: keyboard submission.");
  expect(evidence).not.toContain("Open: keyboard submission.");
});

it("should preserve short journals exactly", () => {
  const content = "# CCR Journal\n\n## Summary\nUseful memory.\n";
  expect(formatJournalEvidence(content)).toBe(content);
});

it("should retain current findings and unresolved steps beyond a long historical prefix", () => {
  const content = `# CCR Journal\n\n## Summary\nNeeds concise completion.\n\n## Work and decisions\n${"old work\n".repeat(700)}\n## Review run latest\n\n### Summary\nCurrent review result.\n\n### Findings and outcomes\nOpen: keyboard submission fails.\n\n### Next steps\nVerify keyboard correction.\n`;
  const evidence = formatJournalEvidence(content);
  expect(evidence).toContain("Current review result.");
  expect(evidence).toContain("Open: keyboard submission fails.");
  expect(evidence).toContain("Verify keyboard correction.");
  expect(evidence).toContain("Review run latest");
  expect(evidence).toContain("omitted");
  expect(evidence.length).toBeLessThanOrEqual(4_000);
});

it("should reserve room for next steps even when findings exceed the evidence budget", () => {
  const evidence = formatJournalEvidence(
    `# CCR Journal\n\n## Summary\nCurrent summary.\n\n## Findings and outcomes\n${"Open issue.\n".repeat(900)}\n## Next steps\nCheck unresolved access.\n`,
  );
  expect(evidence).toContain("Current summary.");
  expect(evidence).toContain("Open issue.");
  expect(evidence).toContain("Check unresolved access.");
  expect(evidence.length).toBeLessThanOrEqual(4_000);
});
