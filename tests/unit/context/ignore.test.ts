import { describe, expect, it } from "vitest";
import { localIgnoreContent } from "../../../src/context/ignore";

describe("localIgnoreContent", () => {
  it("should append the local-continuity block to an existing .gitignore", () => {
    const result = localIgnoreContent("node_modules/\n");
    expect(result.startsWith("node_modules/\n")).toBe(true);
    expect(result).toContain("# ccr:start - local context continuity");
    expect(result).toContain(".ccr/journal/");
    expect(result).toContain(".ccr/private/");
  });

  it("should create the block when no .gitignore exists", () => {
    const result = localIgnoreContent(undefined);
    expect(result).toContain(".ccr/cache/");
    expect(result).toContain(".ccr/tmp/");
  });

  it("should not duplicate an existing block", () => {
    const once = localIgnoreContent(undefined);
    const twice = localIgnoreContent(once);
    expect(twice.split("# ccr:start - local context continuity").length - 1).toBe(1);
  });
});
