import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { applySetup, previewSetup } from "../../../src/context/setup";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

it("should remove a package-managed codebase skill during upgrade", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-skill-migration-"));
  roots.push(root);
  const retiredPath = ".claude/skills/ccr-codebase/SKILL.md";
  await mkdir(path.dirname(path.join(root, retiredPath)), { recursive: true });
  await writeFile(
    path.join(root, retiredPath),
    "---\nname: ccr-codebase\ndescription: Old CCR skill\n---\n\n<!-- managed by CCR skill; package updates may replace this file -->\n# Old codebase skill\n",
    "utf8",
  );

  const preview = await previewSetup(root);
  expect(preview.changes.find((change) => change.path === retiredPath)?.action).toBe("remove");

  await applySetup(root, preview);
  await expect(readFile(path.join(root, retiredPath), "utf8")).rejects.toThrow();
});
