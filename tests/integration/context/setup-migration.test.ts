import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { RETIRED_MANAGED_ARTIFACTS } from "../../../src/context/managed-artifacts";
import { applySetup, previewSetup } from "../../../src/context/setup";
import { createTemporaryRootRegistry } from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();

it("should consolidate package-managed legacy dimension copies into one shared reference", async () => {
  const { mkdir } = await import("node:fs/promises");
  const root = await mkdtemp(path.join(tmpdir(), "ccr-setup-migration-"));
  roots.push(root);
  const retiredDimensions = RETIRED_MANAGED_ARTIFACTS.filter((artifact) =>
    artifact.path.endsWith("/references/dimensions.md"),
  );
  expect(retiredDimensions).toHaveLength(2);
  for (const [index, artifact] of retiredDimensions.entries()) {
    const target = path.join(root, artifact.path);
    await mkdir(path.dirname(target), { recursive: true });
    const content =
      index === 0
        ? artifact.content
        : artifact.content.replace(
            "# CCR review dimensions",
            "# CCR review dimensions\n\nPrevious generated taxonomy.",
          );
    await writeFile(target, content, "utf8");
  }

  const preview = await previewSetup(root);
  for (const artifact of retiredDimensions) {
    expect(preview.changes.find((change) => change.path === artifact.path)?.action).toBe("remove");
  }
  await applySetup(root, preview);

  for (const artifact of retiredDimensions) {
    await expect(readFile(path.join(root, artifact.path), "utf8")).rejects.toThrow();
  }
  expect(
    (await readFile(path.join(root, ".claude/skills/ccr/references/dimensions.md"), "utf8")).length,
  ).toBeGreaterThan(0);
});
