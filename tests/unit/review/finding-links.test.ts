import { describe, expect, it } from "vitest";
import { CCR_SKILLS } from "../../../src/context/skills";
import { REVIEW_DIMENSION_REFERENCE } from "../../../src/review/dimensions";
import { CCR_REVIEW_SKILL } from "../../../src/review/skills";

describe("review finding links", () => {
  it("requires finding links in one sentence using the installed reference path", () => {
    expect(CCR_REVIEW_SKILL).toContain(
      "Link dimension and criterion labels in each finding to their matching headings in `.claude/skills/ccr/references/dimensions.md`.",
    );
  });

  it("does not require a command or wording comparison to use reference links", () => {
    for (const content of [
      ...CCR_SKILLS.map((skill) => skill.content),
      REVIEW_DIMENSION_REFERENCE,
    ]) {
      expect(content).not.toContain("ccr context dimensions --reference");
      expect(content).not.toContain("Only link");
      expect(content).not.toContain("Otherwise leave\nthe names unlinked");
    }
  });

  it("reads review context directly while retaining live dimension validation", () => {
    expect(CCR_REVIEW_SKILL).toContain("recent journals directly from their files");
    expect(CCR_REVIEW_SKILL).toContain("`.ccr/project.md`");
    expect(CCR_REVIEW_SKILL).toContain("ccr context dimensions --select <selection>");
  });
});
