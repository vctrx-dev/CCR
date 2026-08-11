import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "../../..");

describe("GitHub Action public surface", () => {
  it("should not publish an executable action before review orchestration is available", async () => {
    await expect(access(path.join(ROOT, "action.yml"))).rejects.toThrow();

    const [packageText, readme, buildConfig] = await Promise.all([
      readFile(path.join(ROOT, "package.json"), "utf8"),
      readFile(path.join(ROOT, "README.md"), "utf8"),
      readFile(path.join(ROOT, "tsup.config.ts"), "utf8"),
    ]);
    expect(buildConfig).not.toContain("src/action");
    expect(buildConfig).not.toContain("dist/action");
    expect(packageText).not.toContain('"@actions/core"');
    expect(packageText).not.toContain('"@actions/github"');
    expect(readme).toContain("GitHub Action remain on the roadmap");
    expect(readme).toContain("not claimed as available");
  });
});
