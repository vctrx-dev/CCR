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

    expect(result.issues).toContain(".ccr/project.md is missing.");
    expect(result.issues).toContain(
      ".ccr/stakeholders.md contains an unsafe path reference: C:\\private\\records.txt",
    );
  });

  it("should accept plain-language prose that uses words such as all or never", async () => {
    const root = await makeSetup();
    await writeFile(
      path.join(root, ".ccr/project.md"),
      [
        "# Project",
        "",
        "Teachers mark student work. All students receive a pass or fail result.",
        "Learners never see the numeric score behind their result.",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await validateContext(root);

    expect(result).toEqual({ isValid: true, issues: [] });
  });

  it("should validate line-ranged citations and ignore web route literals", async () => {
    const root = await makeSetup();
    await writeFile(path.join(root, "backend.ts"), "export const models = [];\n", "utf8");
    await writeFile(
      path.join(root, ".ccr/project.md"),
      [
        "# Project",
        "",
        "All models are declared in `backend.ts:1-20` and served below `/api/` and `/login`.",
        "The build checks `backend.ts:1-2,8-10`.",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await validateContext(root);

    expect(result).toEqual({ isValid: true, issues: [] });
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

  it("should reject oversized and malformed config through the bounded UTF-8 path", async () => {
    const root = await makeSetup();
    const configPath = path.join(root, ".ccr/config.json");
    await writeFile(configPath, " ".repeat(64_001), "utf8");

    expect((await validateContext(root)).issues).toContain(
      ".ccr/config.json is invalid: .ccr/config.json exceeds 64000 characters.",
    );

    await writeFile(configPath, Buffer.from([255]));
    expect((await validateContext(root)).issues).toContain(
      ".ccr/config.json is invalid: .ccr/config.json is not valid UTF-8 text.",
    );
  });
});
