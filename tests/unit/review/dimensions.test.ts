import { describe, expect, it } from "vitest";
import {
  parseReviewDimensionRegistry,
  renderReviewDimensionReference,
} from "../../../src/review/dimensions";

describe("review dimension registry", () => {
  it("should parse data-only dimensions and preserve their declared order", () => {
    const registry = parseReviewDimensionRegistry({
      schemaVersion: 1,
      dimensions: [
        {
          id: "equality",
          name: "Equality",
          summary: "Review unequal outcomes and access.",
          relatedDimensions: ["privacy"],
          criteria: [
            {
              id: "unequal-outcomes",
              name: "Unequal outcomes",
              details: "Look for behavior that disadvantages a stakeholder group.",
            },
          ],
        },
        {
          id: "privacy",
          name: "Privacy",
          summary: "Review collection, use, exposure, and retention of data.",
          relatedDimensions: ["equality"],
          criteria: [
            {
              id: "unnecessary-collection",
              name: "Unnecessary collection",
              details: "Look for data collection beyond the product purpose.",
            },
          ],
        },
      ],
    });

    expect(registry.dimensions.map(({ id }) => id)).toEqual(["equality", "privacy"]);
  });

  it("should reject duplicate IDs and references to unknown dimensions", () => {
    const dimension = {
      id: "privacy",
      name: "Privacy",
      summary: "Review data handling.",
      relatedDimensions: [],
      criteria: [{ id: "collection", name: "Collection", details: "Review collection." }],
    };

    expect(() =>
      parseReviewDimensionRegistry({ schemaVersion: 1, dimensions: [dimension, dimension] }),
    ).toThrow(/duplicate dimension id/i);
    expect(() =>
      parseReviewDimensionRegistry({
        schemaVersion: 1,
        dimensions: [{ ...dimension, relatedDimensions: ["security"] }],
      }),
    ).toThrow(/unknown related dimension/i);
  });

  it("should render a package-managed progressive-disclosure reference", () => {
    const reference = renderReviewDimensionReference({ schemaVersion: 1, dimensions: [] });

    expect(reference).toMatch(/^---\nname: ccr-review-dimensions\n/);
    expect(reference).toContain("managed by CCR skill");
    expect(reference).toContain('"dimensions": []');
    expect(reference).toContain("No review dimensions are configured");
  });
});
