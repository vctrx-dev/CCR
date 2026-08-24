import { describe, expect, it } from "vitest";
import {
  normalizeRepositoryPath,
  sortUniqueRepositoryPaths,
  truncateEvidence,
} from "../../../src/context/evidence-format";

describe("evidence formatting", () => {
  it("should normalize, deduplicate, and sort repository paths before presentation", () => {
    expect(sortUniqueRepositoryPaths(["z\\file.ts", "a/file.ts", "z/file.ts"])).toEqual([
      "a/file.ts",
      "z/file.ts",
    ]);
    expect(normalizeRepositoryPath("nested\\source.ts")).toBe("nested/source.ts");
  });

  it("should add a caller-owned marker only when bounded evidence is truncated", () => {
    expect(
      truncateEvidence("abcdef", {
        maximumCharacters: 3,
        marker: "[truncated]",
      }),
    ).toBe("abc\n[truncated]\n");
    expect(
      truncateEvidence("abc", {
        maximumCharacters: 3,
        marker: "[truncated]",
        isTruncated: false,
      }),
    ).toBe("abc");
  });

  it("should reject invalid bounds and empty truncation markers", () => {
    expect(() =>
      truncateEvidence("evidence", { maximumCharacters: 0, marker: "[truncated]" }),
    ).toThrow("positive safe character limit");
    expect(() => truncateEvidence("evidence", { maximumCharacters: 1, marker: " " })).toThrow(
      "non-empty marker",
    );
  });
});
