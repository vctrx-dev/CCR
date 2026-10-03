import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTEXT_CONFIG, serializeContextConfig } from "../../../src/context/config";
import { REVIEW_DIMENSIONS } from "../../../src/review/dimensions";
import { saveReview } from "../../../src/review/review-save";
import {
  createTemporaryGitRepository,
  createTemporaryRootRegistry,
  runCommand,
} from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();
const registry = {
  dimensions: ["custom-zeta", "custom-alpha", "custom-middle"].map((id) => ({
    id,
    name: id,
    summary: "Synthetic review scope.",
    criteria: [{ id: "C1", name: "Synthetic criterion", details: "Synthetic question?" }],
  })),
};
const input = {
  scope: "changes",
  dimensions: "all",
  counts: "0,0,0,0",
  summary: "Completed the synthetic selection review.",
};
const now = new Date("2026-09-16T10:00:00Z");
const later = new Date("2026-10-02T12:00:00Z");

async function makeRepository(withTaxonomy = true): Promise<string> {
  const root = await createTemporaryGitRepository(roots, "ccr-selection-save-", "main");
  await mkdir(path.join(root, ".ccr"));
  await writeFile(
    path.join(root, ".ccr/config.json"),
    serializeContextConfig(DEFAULT_CONTEXT_CONFIG),
  );
  if (withTaxonomy) {
    await writeFile(path.join(root, ".ccr/dimensions.json"), JSON.stringify(registry));
  }
  await writeFile(path.join(root, "source.ts"), "export const value = 1;\n");
  await runCommand("git", ["add", "--", ".ccr", "source.ts"], { cwd: root });
  await runCommand("git", ["commit", "--quiet", "-m", "test: seed"], { cwd: root });
  await writeFile(path.join(root, "source.ts"), "export const value = 2;\n");
  return root;
}

async function snapshot(directory: string): Promise<Record<string, string>> {
  const contents: Record<string, string> = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      contents[`${entry.name}/`] = "";
      for (const [relative, content] of Object.entries(await snapshot(file))) {
        contents[`${entry.name}/${relative}`] = content;
      }
    } else {
      contents[entry.name] = (await readFile(file)).toString("base64");
    }
  }
  return contents;
}

describe("save review dimension selection", () => {
  it.each(["changes", "codebase", "PR-19"])(
    "should save a normalized live custom subset for %s",
    async (scope) => {
      const root = await makeRepository();
      const saved = await saveReview(
        root,
        { ...input, scope, dimensions: " CUSTOM-MIDDLE , Custom-Zeta " },
        now,
      );
      expect(await readFile(path.join(root, saved.path), "utf8")).toContain(
        "- **Dimensions**: custom-zeta,custom-middle\n",
      );
      expect(saved.isRecorded).toBe(scope !== "PR-19");
    },
  );

  it("should save standalone all with a live custom taxonomy", async () => {
    const root = await makeRepository();
    const saved = await saveReview(root, { ...input, dimensions: " ALL " }, now);
    expect(await readFile(path.join(root, saved.path), "utf8")).toContain(
      "- **Dimensions**: all\n",
    );
  });

  it("should use packaged IDs only when the taxonomy file is missing without creating it", async () => {
    const root = await makeRepository(false);
    const id = REVIEW_DIMENSIONS.dimensions[0]?.id;
    expect(id).toBeDefined();
    const saved = await saveReview(root, { ...input, dimensions: id?.toUpperCase() }, now);
    expect(await readFile(path.join(root, saved.path), "utf8")).toContain(
      `- **Dimensions**: ${id}\n`,
    );
    await expect(readFile(path.join(root, ".ccr/dimensions.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  const invalid = [
    { name: "unknown ID", dimensions: "unknown-lens", taxonomy: JSON.stringify(registry) },
    {
      name: "case-insensitive duplicate",
      dimensions: "custom-zeta,CUSTOM-ZETA",
      taxonomy: JSON.stringify(registry),
    },
    { name: "mixed all", dimensions: "all,custom-alpha", taxonomy: JSON.stringify(registry) },
    { name: "empty selection", dimensions: "", taxonomy: JSON.stringify(registry) },
    { name: "empty taxonomy", dimensions: "all", taxonomy: '{"dimensions":[]}' },
    { name: "invalid taxonomy", dimensions: "all", taxonomy: '{"dimensions":[{}]}' },
    { name: "malformed taxonomy", dimensions: "all", taxonomy: "not JSON" },
  ];

  describe.each([false, true])("with existing journal=%s", (withJournal) => {
    it.each(invalid)("should reject $name without any context writes or refresh", async (bad) => {
      const root = await makeRepository();
      const journal = withJournal ? await saveReview(root, input, now) : undefined;
      const existing = journal ? await readFile(path.join(root, journal.path), "utf8") : undefined;
      await writeFile(path.join(root, ".ccr/dimensions.json"), bad.taxonomy);
      const before = await snapshot(path.join(root, ".ccr"));

      await expect(
        saveReview(root, { ...input, dimensions: bad.dimensions }, later),
      ).rejects.toThrow();

      expect(await snapshot(path.join(root, ".ccr"))).toEqual(before);
      if (journal) {
        expect(await readFile(path.join(root, journal.path), "utf8")).toBe(existing);
      } else {
        await expect(readdir(path.join(root, ".ccr/journal"))).rejects.toMatchObject({
          code: "ENOENT",
        });
      }
    });
  });
});
