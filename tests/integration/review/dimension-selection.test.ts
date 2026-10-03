import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import { readReviewDimensionRegistry } from "../../../src/review/dimension-file";
import { parseReviewDimensionSelection } from "../../../src/review/dimensions";
import {
  createTemporaryGitRepository,
  createTemporaryRootRegistry,
} from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();
const taxonomy = (ids: string[]) => ({
  dimensions: ids.map((id) => ({
    id,
    name: id,
    summary: "Synthetic review scope.",
    criteria: [{ id: "C1", name: "Synthetic criterion", details: "Synthetic question?" }],
  })),
});

it("should validate against reread custom taxonomy without changing repository files", async () => {
  const root = await createTemporaryGitRepository(roots, "ccr-selection-live-");
  const directory = path.join(root, ".ccr");
  await mkdir(directory);
  const file = path.join(directory, "dimensions.json");
  const original = JSON.stringify(taxonomy(["custom-beta", "custom-alpha"]));
  await writeFile(file, original);
  const registry = await readReviewDimensionRegistry(root);
  expect(parseReviewDimensionSelection("CUSTOM-ALPHA,custom-beta", registry)).toBe(
    "custom-beta,custom-alpha",
  );
  expect(parseReviewDimensionSelection("ALL", registry)).toBe("all");
  for (const selection of ["unknown", "custom-beta,custom-beta", "all,custom-alpha", ""]) {
    expect(() => parseReviewDimensionSelection(selection, registry)).toThrow();
  }
  expect(await readFile(file, "utf8")).toBe(original);
  expect(await readdir(directory)).toEqual(["dimensions.json"]);

  await writeFile(file, JSON.stringify(taxonomy(["replacement-lens"])));
  const revised = await readReviewDimensionRegistry(root);
  expect(() => parseReviewDimensionSelection("custom-alpha", revised)).toThrow(/unknown/i);
  expect(parseReviewDimensionSelection("replacement-lens", revised)).toBe("replacement-lens");

  await writeFile(file, JSON.stringify(taxonomy([])));
  const empty = await readReviewDimensionRegistry(root);
  expect(() => parseReviewDimensionSelection("all", empty)).toThrow(/no review dimensions/i);
  expect(await readdir(directory)).toEqual(["dimensions.json"]);
});
