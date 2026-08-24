import { describe, expect, it } from "vitest";
import {
  REVIEW_DIMENSIONS,
  parseReviewDimensionRegistry,
  renderReviewDimensionReference,
} from "../../../src/review/dimensions";

describe("review dimension registry", () => {
  it("should ship the configured review dimensions in canonical order", () => {
    expect(REVIEW_DIMENSIONS.dimensions.map(({ id }) => id)).toEqual([
      "fairness-evaluation",
      "pedagogy",
      "decision-fairness",
      "inclusion",
      "transparency",
      "privacy",
    ]);
  });

  it("should parse data-only dimensions and preserve their declared order", () => {
    const registry = parseReviewDimensionRegistry({
      dimensions: [
        {
          id: "equality",
          name: "Equality",
          summary: "Review unequal outcomes and access.",
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

  it("should reject duplicate IDs and removed registry fields", () => {
    const dimension = {
      id: "privacy",
      name: "Privacy",
      summary: "Review data handling.",
      criteria: [{ id: "collection", name: "Collection", details: "Review collection." }],
    };

    expect(() => parseReviewDimensionRegistry({ dimensions: [dimension, dimension] })).toThrow(
      /duplicate dimension id/i,
    );
    expect(() =>
      parseReviewDimensionRegistry({
        dimensions: [{ ...dimension, relatedDimensions: ["security"] }],
      }),
    ).toThrow(/unrecognized key/i);
    expect(() =>
      parseReviewDimensionRegistry({
        dimensions: [
          {
            ...dimension,
            criteria: [
              { id: "collection", name: "Collection", details: "Review collection." },
              { id: "collection", name: "Collection again", details: "Review collection again." },
            ],
          },
          {
            ...dimension,
            id: "equality",
            name: "Equality",
            criteria: [{ id: "outcomes", name: "Outcomes", details: "Review unequal outcomes." }],
          },
        ],
      }),
    ).toThrow(/duplicate criterion id/i);
    expect(() =>
      parseReviewDimensionRegistry({ schemaVersion: 1, dimensions: [dimension] }),
    ).toThrow(/unrecognized key/i);
  });

  it("should render a package-managed progressive-disclosure reference", () => {
    const reference = renderReviewDimensionReference({ dimensions: [] });

    expect(reference).toMatch(/^---\nname: ccr-review-dimensions\n/);
    expect(reference).toContain("managed by CCR skill");
    expect(reference).toContain('"dimensions": []');
    expect(reference).toContain("No review dimensions are configured");
  });
});
