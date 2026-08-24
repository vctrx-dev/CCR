import { describe, expect, it } from "vitest";
import { REVIEW_DIMENSIONS } from "../../../src/review/dimensions";
import { CCR_CODEBASE_SKILL, CCR_REVIEW_SKILL } from "../../../src/review/skills";

const EXAMPLE_COMMAND_PATTERN = /`\/ccr-(?:review|codebase) ([^`]+)`/gu;
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
    const selectedIds = [
      ...exampleDimensionIds(CCR_REVIEW_SKILL),
      ...exampleDimensionIds(CCR_CODEBASE_SKILL),
    ];

    expect(selectedIds).not.toHaveLength(0);
    for (const id of selectedIds) {
      expect(configuredIds).toContain(id);
    }
  });
});
