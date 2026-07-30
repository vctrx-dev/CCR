import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { DEFAULT_CONTEXT_CONFIG } from "../../../src/context/config";
import { applySetup } from "../../../src/context/setup";
import { applyUninstall, previewUninstall } from "../../../src/context/uninstall";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

it("should preview safely and preserve context unless removal is explicit", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-uninstall-"));
  roots.push(root);
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(path.join(root, ".ccr"));
  await writeFile(
    path.join(root, ".ccr/config.json"),
    `${JSON.stringify(
      {
        ...DEFAULT_CONTEXT_CONFIG,
        instructions: { updateClaudeMd: true, updateAgentsMd: false },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await applySetup(root);

  const preview = await previewUninstall(root, false);
  expect(preview.removePaths).toEqual([
    ".claude/skills/ccr/SKILL.md",
    ".claude/skills/ccr-context/SKILL.md",
  ]);
  expect(await readFile(path.join(root, "CLAUDE.md"), "utf8")).toContain("<!-- ccr:start -->");

  await applyUninstall(root, false);
  expect(await readFile(path.join(root, ".ccr/config.json"), "utf8")).toBeTruthy();
  expect(await readFile(path.join(root, "CLAUDE.md"), "utf8")).not.toContain("<!-- ccr:start -->");

  await applyUninstall(root, true);
  await expect(readFile(path.join(root, ".ccr/config.json"), "utf8")).rejects.toThrow();
});

it("should preserve local ignore rules while a private journal remains", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-uninstall-local-"));
  roots.push(root);
  await applySetup(root);
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(path.join(root, ".ccr/journal/feature"), { recursive: true });
  await writeFile(path.join(root, ".ccr/journal/feature/entry.md"), "private continuity\n", "utf8");

  const preview = await previewUninstall(root, true);
  expect(preview.modifyPaths).not.toContain(".gitignore");

  await applyUninstall(root, true);
  expect(await readFile(path.join(root, ".gitignore"), "utf8")).toContain(
    "# ccr:start - local context continuity",
  );
  expect(await readFile(path.join(root, ".ccr/journal/feature/entry.md"), "utf8")).toContain(
    "private continuity",
  );
});

it("should remove a legacy package-managed skill", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-uninstall-legacy-"));
  roots.push(root);
  const { mkdir, writeFile } = await import("node:fs/promises");
  const skillPath = path.join(root, ".claude/skills/ccr/SKILL.md");
  await mkdir(path.dirname(skillPath), { recursive: true });
  await writeFile(
    skillPath,
    "<!-- managed by CCR skill; package updates may replace this file -->\n# Old CCR skill\n",
    "utf8",
  );

  expect((await previewUninstall(root, false)).removePaths).toEqual([
    ".claude/skills/ccr/SKILL.md",
  ]);
});
