import { describe, expect, it } from "vitest";
import { filterExcludedPaths } from "../../../src/context/privacy";

describe("filterExcludedPaths", () => {
  it("should exclude sensitive paths before Claude receives a staged path list", () => {
    const result = filterExcludedPaths(
      [
        "src/main.py",
        ".CCR/JOURNAL/work.md",
        ".NPMRC",
        "keys/signing.PEM",
        "src/readme.md\n.env",
        ".env.local",
        "apps/api/.env.production",
        "config/secrets/key.json",
        "fixtures/student-data/records.csv",
      ],
      [],
    );

    expect(result.included).toEqual(["src/main.py"]);
    expect(result.excluded).toHaveLength(8);
  });
});
