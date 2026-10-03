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

it.each(["customized-default", "human-owned", "malformed"] as const)(
  "should preserve a %s taxonomy across setup and ordinary uninstall",
  async (kind) => {
    const root = await mkdtemp(path.join(tmpdir(), "ccr-dimension-custom-"));
    roots.push(root);
    await mkdir(path.join(root, ".ccr"));
    const content =
      kind === "customized-default"
        ? serializeUpgradableJsonArtifact(priorRegistry).replace("Previous scope.", "Custom scope.")
        : kind === "human-owned"
          ? JSON.stringify(priorRegistry)
          : "invalid JSON";
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
