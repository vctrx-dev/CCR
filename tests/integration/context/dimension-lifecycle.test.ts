import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { serializeUpgradableJsonArtifact } from "../../../src/context/managed-json";
import { applySetup, previewSetup } from "../../../src/context/setup";
import { applyUninstall } from "../../../src/context/uninstall";
import { previewUninstall } from "../../../src/context/uninstall";
import { validateContext } from "../../../src/context/validate";
import { readReviewDimensionRegistry } from "../../../src/review/dimension-file";
import { REVIEW_DIMENSIONS } from "../../../src/review/dimensions";
import { createTemporaryRootRegistry } from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();
const priorRegistry = {
  dimensions: [
    {
      id: "older-example",
      name: "Older example",
      summary: "Previous scope.",
      criteria: [{ id: "old", name: "Older criterion", details: "Previous question?" }],
    },
  ],
};

it("should install parseable taxonomy, refresh untouched older defaults, and remain idempotent", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-dimension-defaults-"));
  roots.push(root);
  const preview = await previewSetup(root);
  expect(preview.changes.find(({ path: file }) => file === ".ccr/dimensions.json")?.action).toBe(
    "create",
  );
  await expect(readFile(path.join(root, ".ccr/dimensions.json"))).rejects.toThrow();
  await applySetup(root, preview);
  expect(await readReviewDimensionRegistry(root)).toEqual(REVIEW_DIMENSIONS);
  await writeFile(
    path.join(root, ".ccr/dimensions.json"),
    serializeUpgradableJsonArtifact(priorRegistry),
  );
  expect((await applySetup(root)).changedPaths).toContain(".ccr/dimensions.json");
  expect(await readReviewDimensionRegistry(root)).toEqual(REVIEW_DIMENSIONS);
  expect((await applySetup(root)).changedPaths).toEqual([]);
});

it.each(["customized-default", "human-owned"] as const)(
  "should preserve a %s taxonomy across setup and ordinary uninstall",
  async (kind) => {
    const root = await mkdtemp(path.join(tmpdir(), "ccr-dimension-custom-"));
    roots.push(root);
    await mkdir(path.join(root, ".ccr"));
    const content =
      kind === "customized-default"
        ? serializeUpgradableJsonArtifact(priorRegistry).replace("Previous scope.", "Custom scope.")
        : JSON.stringify(priorRegistry);
    const file = path.join(root, ".ccr/dimensions.json");
    await writeFile(file, content);
    expect((await applySetup(root)).changedPaths).not.toContain(".ccr/dimensions.json");
    expect(await readFile(file, "utf8")).toBe(content);
    await applyUninstall(root, false);
    expect(await readFile(file, "utf8")).toBe(content);
    await applyUninstall(root, true);
    await expect(readFile(file)).rejects.toThrow();
  },
);

it("should stop setup on invalid authoritative JSON while ordinary uninstall preserves it", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-dimension-invalid-setup-"));
  roots.push(root);
  await mkdir(path.join(root, ".ccr"));
  const file = path.join(root, ".ccr/dimensions.json");
  await writeFile(file, "invalid JSON");
  await expect(previewSetup(root)).rejects.toThrow(/JSON/i);
  await applyUninstall(root, false);
  expect(await readFile(file, "utf8")).toBe("invalid JSON");
});

it("should generate setup defaults and reference from current source JSON", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-source-dimension-setup-"));
  roots.push(root);
  await mkdir(path.join(root, "src/review"), { recursive: true });
  await writeFile(path.join(root, "src/review/dimensions.json"), JSON.stringify(priorRegistry));
  await applySetup(root);
  expect(await readReviewDimensionRegistry(root)).toEqual(priorRegistry);
  const referencePath = path.join(root, ".claude/skills/ccr/references/dimensions.md");
  expect(await readFile(referencePath, "utf8")).toContain("Previous question?");
  const revised = JSON.stringify(priorRegistry).replace(
    "Previous question?",
    "Updated source question?",
  );
  await writeFile(path.join(root, "src/review/dimensions.json"), revised);
  await applySetup(root);
  expect(await readFile(referencePath, "utf8")).toContain("Updated source question?");
  expect(
    JSON.parse(await readFile(path.join(root, ".ccr/dimensions.json"), "utf8")).dimensions,
  ).toEqual(JSON.parse(revised).dimensions);
});

it("should refuse oversized taxonomy before lifecycle readers retain its full content", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-dimension-oversized-"));
  roots.push(root);
  await mkdir(path.join(root, ".ccr"));
  await writeFile(path.join(root, ".ccr/dimensions.json"), " ".repeat(256_001));
  await expect(previewSetup(root)).rejects.toThrow(/limit/u);
  await expect(previewUninstall(root, true)).rejects.toThrow(/limit/u);
});

it("should report invalid taxonomy in shared-context validation without disclosing input", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-dimension-validation-"));
  roots.push(root);
  await applySetup(root);
  await writeFile(path.join(root, ".ccr/dimensions.json"), "PRIVATE123");
  const validation = await validateContext(root);
  expect(validation.isValid).toBe(false);
  expect(validation.issues.some((issue) => issue.includes(".ccr/dimensions.json"))).toBe(true);
  expect(validation.issues.join("\n")).not.toContain("PRIVATE123");
});
