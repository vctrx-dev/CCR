import { describe, expect, it } from "vitest";
import {
  REVIEW_DIMENSIONS,
  parseReviewDimensionRegistry,
  parseReviewDimensionSelection,
} from "../../../src/review/dimensions";

const registry = parseReviewDimensionRegistry({
  dimensions: ["custom-zeta", "custom-alpha", "custom-middle"].map((id) => ({
    id,
    name: id,
    summary: "Synthetic review scope.",
    criteria: [{ id: "C1", name: "Synthetic criterion", details: "Synthetic question?" }],
  })),
});

describe("review dimension selection", () => {
  it("should accept each packaged dimension individually", () => {
    for (const { id } of REVIEW_DIMENSIONS.dimensions) {
      expect(parseReviewDimensionSelection(id, REVIEW_DIMENSIONS)).toBe(id);
    }
  });

  it("should normalize space-separated and mixed selections while retaining only chosen IDs", () => {
    for (const selection of [" Custom-Middle   CUSTOM-ZETA ", "custom-middle, \tCustom-Zeta"]) {
      expect(parseReviewDimensionSelection(selection, registry)).toBe("custom-zeta,custom-middle");
    }
  });

  it("should retain custom IDs and normalize subsets into registry order", () => {
    expect(parseReviewDimensionSelection("custom-alpha", registry)).toBe("custom-alpha");
    expect(parseReviewDimensionSelection(" CUSTOM-MIDDLE , Custom-Zeta ", registry)).toBe(
      "custom-zeta,custom-middle",
    );
    expect(parseReviewDimensionSelection("custom-middle,custom-alpha,custom-zeta", registry)).toBe(
      "custom-zeta,custom-alpha,custom-middle",
    );
  });

  it("should accept only a standalone all token, case-insensitively", () => {
    expect(parseReviewDimensionSelection("all", registry)).toBe("all");
    expect(parseReviewDimensionSelection(" ALL ", registry)).toBe("all");
    for (const selection of [
      "all,custom-zeta",
      "custom-alpha,ALL",
      "all,all",
      "all,unknown",
      "all custom-zeta",
    ]) {
      expect(() => parseReviewDimensionSelection(selection, registry)).toThrow(/all.*alone/i);
    }
  });

  it("should reject unknown IDs without fuzzy matching", () => {
    for (const selection of [
      "custom-zet",
      "unknown",
      "custom-zeta,unknown",
      "custom-zeta unknown",
    ]) {
      expect(() => parseReviewDimensionSelection(selection, registry)).toThrow(
        /unknown review dimension/i,
      );
    }
  });

  it("should reject duplicates after case and whitespace normalization", () => {
    for (const selection of [
      "custom-zeta,custom-zeta",
      "CUSTOM-ALPHA, custom-alpha",
      "custom-zeta CUSTOM-ZETA",
    ]) {
      expect(() => parseReviewDimensionSelection(selection, registry)).toThrow(/duplicate/i);
    }
  });

  it("should reject empty selections, empty comma-separated entries, and non-string input", () => {
    for (const selection of [
      "",
      " ",
      ",",
      "custom-zeta,",
      ",custom-alpha",
      "custom-zeta,,custom-alpha",
      "custom-zeta, ,custom-alpha",
      null,
      [],
      7,
    ]) {
      expect(() => parseReviewDimensionSelection(selection, registry)).toThrow();
    }
  });

  it("should stop every selection when the live taxonomy is empty", () => {
    for (const selection of ["all", "custom-zeta", ""]) {
      expect(() => parseReviewDimensionSelection(selection, { dimensions: [] })).toThrow(
        /no review dimensions are configured/i,
      );
    }
  });

  it("should validate the supplied registry instead of trusting a malformed taxonomy", () => {
    const dimension = registry.dimensions[0];
    for (const input of [null, { dimensions: [{}] }, { dimensions: [dimension, dimension] }]) {
      expect(() => parseReviewDimensionSelection("all", input)).toThrow();
    }
  });
});
