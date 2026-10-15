import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applySetup } from "../../../src/context/setup";
import { CONTEXT_FILES } from "../../../src/context/templates";
import { inspectContextReadiness, validateContext } from "../../../src/context/validate";

const roots: string[] = [];
const readFileMock = vi.hoisted(() => vi.fn());

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  readFileMock.mockImplementation(actual.readFile);
  return { ...actual, readFile: readFileMock };
});

afterEach(async () => {
  readFileMock.mockClear();
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
  it("should distinguish installed templates, partial population, and populated context", async () => {
    const root = await makeSetup();
    expect(await inspectContextReadiness(root)).toMatchObject({
      isValid: true,
      readiness: "unfilled",
      unfilledPaths: [".ccr/project.md", ".ccr/stakeholders.md"],
    });
    await writeFile(path.join(root, ".ccr/project.md"), "# Project\nPeople share lesson plans.\n");
    await writeFile(
      path.join(root, ".ccr/stakeholders.md"),
      `${CONTEXT_FILES[".ccr/stakeholders.md"]?.replaceAll("\n", "\r\n")}\r\n`,
    );
    expect(await inspectContextReadiness(root)).toMatchObject({
      readiness: "unfilled",
      unfilledPaths: [".ccr/stakeholders.md"],
    });
    await writeFile(
      path.join(root, ".ccr/stakeholders.md"),
      "# Stakeholders\nTeachers share their plans.\n",
    );
    expect(await inspectContextReadiness(root)).toMatchObject({
      readiness: "populated",
      unfilledPaths: [],
    });
    await writeFile(path.join(root, ".ccr/project.md"), "# Project\n\n## Purpose\n");
    expect(await inspectContextReadiness(root)).toMatchObject({ readiness: "unfilled" });
    await rm(path.join(root, ".ccr/project.md"));
    expect(await inspectContextReadiness(root)).toMatchObject({
      readiness: "invalid",
      isValid: false,
    });
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

  it("should reject oversized shared context without a full-file read", async () => {
    const root = await makeSetup();
    const projectPath = path.join(root, ".ccr/project.md");
    const stakeholdersPath = path.join(root, ".ccr/stakeholders.md");
    await writeFile(projectPath, `# Project\n\n${"a".repeat(10_001)}`, "utf8");
    await writeFile(stakeholdersPath, `# Stakeholders\n\n${"b".repeat(10_001)}`, "utf8");

    readFileMock.mockClear();

    expect(await validateContext(root)).toEqual({
      isValid: false,
      issues: [
        ".ccr/project.md exceeds the 10000-character validation inspection limit; shorten it before validation.",
        ".ccr/stakeholders.md exceeds its 10000-character limit.",
      ],
    });

    expect(readFileMock).not.toHaveBeenCalledWith(projectPath, "utf8");
    expect(readFileMock).not.toHaveBeenCalledWith(stakeholdersPath, "utf8");
  });
});
