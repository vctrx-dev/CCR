import { describe, expect, it } from "vitest";
import { renderPromptPreview } from "../../../src/review/prompt-preview";

const first = {
  id: "first",
  name: "First",
  summary: "Synthetic summary",
  criteria: [
    { id: "sample", name: "Sample", details: "Synthetic criterion" },
    { id: "other", name: "Other", details: "Other synthetic criterion" },
  ],
};
const second = {
  ...first,
  id: "second",
  name: "Second",
  summary: "Second synthetic summary",
  criteria: [{ id: "unique", name: "Unique", details: "Unique synthetic criterion" }],
};
const registry = { dimensions: [first, second] };

describe("single-dimension prompt preview", () => {
  it("should include every criterion of only the selected dimension and reflect edited input", () => {
    const output = renderPromptPreview([], registry);
    for (const text of [
      first.name,
      ...first.criteria.flatMap(({ name, details }) => [name, details]),
    ]) {
      expect(output).toContain(text);
    }
    expect(output).not.toContain("Unique synthetic criterion");
    expect(output).not.toContain("sample");
    const revised = { ...first, name: "Revised" };
    expect(renderPromptPreview([], { dimensions: [revised] })).toContain("Dimension: Revised");
  });

  it("should follow registry order rather than hard-code a dimension", () => {
    const output = renderPromptPreview([], { dimensions: [second, first] });
    expect(output).toContain("Unique synthetic criterion");
    expect(output).not.toContain("Other synthetic criterion");
  });

  it("should reject arguments, empty registries, and malformed registries", () => {
    for (const args of [["missing"], ["first", "second"], ["first,second"]]) {
      expect(() => renderPromptPreview(args, registry)).toThrow();
    }
    expect(() => renderPromptPreview([], { dimensions: [] })).toThrow();
    expect(() => renderPromptPreview([], { dimensions: [first, first] })).toThrow();
  });
});
