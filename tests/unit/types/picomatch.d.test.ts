import picomatch from "picomatch";
import { describe, expect, it } from "vitest";

describe("picomatch type boundary", () => {
  it("should return a matcher for configured path patterns", () => {
    const isEnvironmentFile = picomatch("**/.env*", { dot: true });

    expect(isEnvironmentFile(".env.local")).toBe(true);
    expect(isEnvironmentFile("src/main.ts")).toBe(false);
  });
});
