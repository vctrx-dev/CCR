import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applySetup } from "../../../src/context/setup";
import { validateContext } from "../../../src/context/validate";

const roots: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function makeSetup(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-validation-"));
  roots.push(root);
  await applySetup(root);
  return root;
}

describe("validateContext", () => {
  it("should accept a generated setup", async () => {
    const result = await validateContext(await makeSetup());
    expect(result).toEqual({ isValid: true, issues: [] });
  });

  it("should report invalid config and secret-like context", async () => {
    const root = await makeSetup();
    await writeFile(path.join(root, ".ccr/config.json"), '{"schemaVersion":2}\n', "utf8");
    await writeFile(
      path.join(root, ".ccr/project.md"),
      `# Project\n\n${["-----BEGIN", "PRIVATE KEY-----"].join(" ")}\n`,
      "utf8",
    );

    const result = await validateContext(root);

    expect(result.isValid).toBe(false);
    expect(result.issues.join("\n")).toMatch(/config\.json/);
    expect(result.issues.join("\n")).toMatch(/secret-like/);
  });

  it("should reject a context path that does not exist", async () => {
    const root = await makeSetup();
    await writeFile(
      path.join(root, ".ccr/project.md"),
      "# Project\n\nEntry point: `missing/app/`.\n",
      "utf8",
    );

    const result = await validateContext(root);

    expect(result.issues).toContain(".ccr/project.md references a missing path: missing/app/");
  });

  it("should reject broken context routes and host-independent unsafe paths", async () => {
    const root = await makeSetup();
    await rm(path.join(root, ".ccr/project.md"));
    await writeFile(
      path.join(root, ".ccr/stakeholders.md"),
      "# Stakeholders\n\nUnsafe: `C:\\private\\records.txt`.\n",
      "utf8",
    );

    const result = await validateContext(root);

    expect(result.issues).toContain(".ccr/index.md references a missing route: project.md");
    expect(result.issues).toContain(
      ".ccr/stakeholders.md contains an unsafe path reference: C:\\private\\records.txt",
    );
  });

  it("should reject absolute claims", async () => {
    const root = await makeSetup();
    await writeFile(
      path.join(root, ".ccr/project.md"),
      ["# Project", "", "The service never returns an incorrect result.", ""].join("\n"),
      "utf8",
    );

    const result = await validateContext(root);

    expect(result.issues.join("\n")).toContain("contains an absolute claim");
  });

  it("should allow absolute words inside commands and code examples", async () => {
    const root = await makeSetup();
    await writeFile(
      path.join(root, ".ccr/project.md"),
      [
        "# Project",
        "",
        "Run `npm run test:all` for the repository suite.",
        "",
        "```sh",
        "npm run test:all",
        "```",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await validateContext(root);

    expect(result.issues.join("\n")).not.toContain("contains an absolute claim");
  });
});
