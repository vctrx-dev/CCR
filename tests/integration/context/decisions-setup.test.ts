import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { applySetup } from "../../../src/context/setup";
import { createTemporaryRootRegistry } from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();

it("should create an empty, user-owned decisions document", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-decisions-setup-"));
  roots.push(root);

  await applySetup(root);

  expect(await readFile(path.join(root, ".ccr/decisions.md"), "utf8")).toBe("");
});

it("should preserve decisions a user has already recorded", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-decisions-setup-"));
  roots.push(root);
  const decisionsPath = path.join(root, ".ccr/decisions.md");
  await mkdir(path.dirname(decisionsPath), { recursive: true });
  await writeFile(decisionsPath, "- Keep reviews advisory.\n", "utf8");

  await applySetup(root);

  expect(await readFile(decisionsPath, "utf8")).toBe("- Keep reviews advisory.\n");
});
