import { describe, expect, it } from "vitest";
import { REVIEW_DIMENSIONS } from "../../../src/review/dimensions";
import { CCR_REVIEW_SKILL } from "../../../src/review/skills";

const EXAMPLE_COMMAND_PATTERN = /`\/ccr-review (?:changes|codebase|PR-\d+) ([^`]+)`/gu;
const INTENTIONALLY_INVALID_EXAMPLE_IDS = new Set(["unknown"]);

function exampleDimensionIds(skill: string): string[] {
  return Array.from(skill.matchAll(EXAMPLE_COMMAND_PATTERN))
    .flatMap(([, selection]) => selection.split(","))
    .map((id) => id.trim())
    .filter((id) => id !== "all" && !INTENTIONALLY_INVALID_EXAMPLE_IDS.has(id));
}

describe("review skills", () => {
  it("should use configured IDs in valid example selections", () => {
    const configuredIds = new Set(REVIEW_DIMENSIONS.dimensions.map(({ id }) => id));
    const selectedIds = exampleDimensionIds(CCR_REVIEW_SKILL);

    expect(selectedIds).not.toHaveLength(0);
    for (const id of selectedIds) {
      expect(configuredIds).toContain(id);
    }
  });

  it("should combine changes, codebase, and PR review scopes in one skill", () => {
    expect(CCR_REVIEW_SKILL).toContain("name: ccr-review");
    expect(CCR_REVIEW_SKILL).toContain("/ccr-review codebase");
    expect(CCR_REVIEW_SKILL).toContain("/ccr-review PR-123");
    expect(CCR_REVIEW_SKILL).toContain("/ccr-review changes all");
    expect(CCR_REVIEW_SKILL).toContain("context review-pr PR-<number>");
    expect(CCR_REVIEW_SKILL).toContain("context review-pr-head PR-<number>");
    expect(CCR_REVIEW_SKILL).not.toContain("gh pr view");
    expect(CCR_REVIEW_SKILL).not.toContain("gh pr diff");
    expect(CCR_REVIEW_SKILL).not.toContain("gh api");
    expect(CCR_REVIEW_SKILL).toMatch(/read-only.{0,120}(?:checkout|branch)/is);
  });

  it("should bound PR evidence before worker dispatch", () => {
    expect(CCR_REVIEW_SKILL).toContain("maximum of 200 changed paths");
    expect(CCR_REVIEW_SKILL).toMatch(/524288\s+bytes/);
    expect(CCR_REVIEW_SKILL).toContain("131072 bytes per head file");
    expect(CCR_REVIEW_SKILL).toMatch(/2097152\s+bytes total/);
    expect(CCR_REVIEW_SKILL).toContain("commands enforce these limits before emitting evidence");
    expect(CCR_REVIEW_SKILL).toContain("report a PR evidence-size blocker and stop");
    expect(CCR_REVIEW_SKILL).not.toContain("per_page=");
    expect(CCR_REVIEW_SKILL).not.toContain(
      "--json number,title,baseRefName,headRefName,baseRefOid,headRefOid,files",
    );
  });

  it("should require a completed journal summary after every review", () => {
    expect(CCR_REVIEW_SKILL).toContain("Replace `Needs concise completion.`");
    expect(CCR_REVIEW_SKILL).toMatch(/summary.{0,180}scope, evidence, and outcome/is);
    expect(CCR_REVIEW_SKILL).toMatch(/re-read.{0,160}edited journal.{0,160}placeholder/is);
  });
});
