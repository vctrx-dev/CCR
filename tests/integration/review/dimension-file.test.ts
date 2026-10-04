import { mkdir, mkdtemp, rename, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { serializeUpgradableJsonArtifact } from "../../../src/context/managed-json";
import { readReviewDimensionRegistry } from "../../../src/review/dimension-file";
import {
  REVIEW_DIMENSIONS,
  parseReviewDimensionSelection,
  renderReviewDimensionSections,
} from "../../../src/review/dimensions";
import { computeReviewContextState } from "../../../src/review/review-state";
import {
  createTemporaryGitRepository,
  createTemporaryRootRegistry,
} from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();
const registry = {
  dimensions: [
    {
      id: "example-lens",
      name: "Example lens",
      summary: "Example scope.",
      criteria: [{ id: "A1", name: "Example criterion", details: "Example question?" }],
    },
  ],
};

it("should reread source JSON ahead of repository copies without a build and update freshness", async () => {
  const root = await createTemporaryGitRepository(roots, "ccr-source-dimensions-");
  await mkdir(path.join(root, "src/review"), { recursive: true });
  await mkdir(path.join(root, ".ccr"));
  await writeFile(path.join(root, ".ccr/config.json"), "{}");
  await writeFile(path.join(root, ".ccr/dimensions.json"), JSON.stringify(REVIEW_DIMENSIONS));
  const file = path.join(root, "src/review/dimensions.json");
  await writeFile(file, JSON.stringify(registry));
  expect(await readReviewDimensionRegistry(root)).toEqual(registry);
  const before = await computeReviewContextState(root);
  const revised = {
    dimensions: [
      {
        ...registry.dimensions[0],
        id: "renamed-source",
        criteria: [
          { id: "N1", name: "Current source criterion", details: "Current source question?" },
        ],
      },
    ],
  };
  await writeFile(file, JSON.stringify(revised));
  const current = await readReviewDimensionRegistry(root);
  expect(current).toEqual(revised);
  expect(parseReviewDimensionSelection("renamed-source", current)).toBe("renamed-source");
  expect(() => parseReviewDimensionSelection("example-lens", current)).toThrow(/unknown/i);
  expect(renderReviewDimensionSections(current)).toContain("Current source question?");
  expect((await computeReviewContextState(root)).contextFingerprint).not.toBe(
    before.contextFingerprint,
  );
  await writeFile(file, "invalid JSON");
  await expect(readReviewDimensionRegistry(root)).rejects.toThrow(/JSON/i);
});

it("should follow live package defaults for an untouched old setup copy", async () => {
  const root = await createTemporaryGitRepository(roots, "ccr-live-default-dimensions-");
  await mkdir(path.join(root, ".ccr"));
  await writeFile(
    path.join(root, ".ccr/dimensions.json"),
    serializeUpgradableJsonArtifact(registry),
  );
  expect(await readReviewDimensionRegistry(root)).toEqual(REVIEW_DIMENSIONS);
  await writeFile(path.join(root, ".ccr/dimensions.json"), JSON.stringify(registry));
  expect(await readReviewDimensionRegistry(root)).toEqual(registry);
});

it("should use packaged defaults only when the repository file is absent and reread local edits", async () => {
  const root = await createTemporaryGitRepository(roots, "ccr-dimension-file-");
  expect(await readReviewDimensionRegistry(root)).toEqual(REVIEW_DIMENSIONS);
  await mkdir(path.join(root, ".ccr"));
  await writeFile(path.join(root, ".ccr/config.json"), "{}");
  const file = path.join(root, ".ccr/dimensions.json");
  await writeFile(file, JSON.stringify(registry));
  const first = await readReviewDimensionRegistry(root);
  expect(first).toEqual(registry);
  const before = await computeReviewContextState(root);
  const changed = { dimensions: [{ ...registry.dimensions[0], summary: "Revised scope." }] };
  await writeFile(file, JSON.stringify(changed));
  const second = await readReviewDimensionRegistry(root);
  expect(second).toEqual(changed);
  expect(renderReviewDimensionSections(second)).not.toBe(renderReviewDimensionSections(first));
  const after = await computeReviewContextState(root);
  expect(after.contextFingerprint).not.toBe(before.contextFingerprint);
  expect(after.inputContextFingerprint).not.toBe(before.inputContextFingerprint);
  await writeFile(file, '{"dimensions":[]}');
  expect(await readReviewDimensionRegistry(root)).toEqual({ dimensions: [] });
});

it("should fail closed on malformed, oversized, binary, directory, or symlink taxonomy input", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-dimension-invalid-"));
  roots.push(root);
  await mkdir(path.join(root, ".ccr"));
  const file = path.join(root, ".ccr/dimensions.json");
  for (const content of [
    "PRIVATE123",
    JSON.stringify({ dimensions: [{ id: "invalid" }] }),
    '{"PRIVATE123":"value","dimensions":[]}',
    " ".repeat(256_001),
    Buffer.from([0xff]),
  ]) {
    await writeFile(file, content);
    await expect(readReviewDimensionRegistry(root)).rejects.toThrow();
    try {
      await readReviewDimensionRegistry(root);
    } catch (error: unknown) {
      if (!(error instanceof Error)) throw error;
      expect(error.message).not.toContain("PRIVATE123");
    }
  }
  const outside = await mkdtemp(path.join(tmpdir(), "ccr-dimension-outside-"));
  roots.push(outside);
  await writeFile(path.join(outside, "dimensions.json"), JSON.stringify(registry));
  await rename(file, `${file}.invalid`);
  await mkdir(file);
  await expect(readReviewDimensionRegistry(root)).rejects.toThrow();
  const linkedRoot = path.join(root, "linked-root");
  await mkdir(linkedRoot);
  await symlink(
    outside,
    path.join(linkedRoot, ".ccr"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await expect(readReviewDimensionRegistry(linkedRoot)).rejects.toThrow(/symbolic link/u);
});
