import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { DEFAULT_CONTEXT_CONFIG, serializeContextConfig } from "../../../src/context/config";
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
    serializeContextConfig({
      ...DEFAULT_CONTEXT_CONFIG,
      instructions: { updateClaudeMd: true, updateAgentsMd: false, updateDecisionsMd: false },
    }),
    "utf8",
  );
  await applySetup(root);

  const preview = await previewUninstall(root, false);
  expect(preview.removePaths).toEqual([
    ".claude/skills/ccr/SKILL.md",
    ".claude/skills/ccr-context/SKILL.md",
    ".claude/skills/ccr-hooks/SKILL.md",
    ".claude/skills/ccr-review/SKILL.md",
    ".claude/skills/ccr/references/dimensions.md",
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

it("should not treat empty internal lock scaffolding as developer state", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-uninstall-locks-"));
  roots.push(root);
  await applySetup(root);

  const preview = await previewUninstall(root, true);

  expect(preview.modifyPaths).toContain(".gitignore");
});

it("should remove a legacy package-managed skill", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-uninstall-legacy-"));
  roots.push(root);
  const { mkdir, writeFile } = await import("node:fs/promises");
  const skillPath = path.join(root, ".claude/skills/ccr/SKILL.md");
  await mkdir(path.dirname(skillPath), { recursive: true });
  await writeFile(
    skillPath,
    "---\nname: ccr\ndescription: Old CCR skill\n---\n\n<!-- managed by CCR skill; package updates may replace this file -->\n# Old CCR skill\n",
    "utf8",
  );

  expect((await previewUninstall(root, false)).removePaths).toEqual([
    ".claude/skills/ccr/SKILL.md",
  ]);
});

it("should reject malformed instruction markers without modifying the file", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-uninstall-conflict-"));
  roots.push(root);
  const { writeFile } = await import("node:fs/promises");
  const content = "<!-- ccr:start -->\nuser content\n";
  await writeFile(path.join(root, "CLAUDE.md"), content, "utf8");

  await expect(previewUninstall(root, false)).rejects.toThrow(
    "managed block conflict in CLAUDE.md",
  );
  expect(await readFile(path.join(root, "CLAUDE.md"), "utf8")).toBe(content);
});

it("should ignore inline marker prose during uninstall", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-uninstall-inline-"));
  roots.push(root);
  const { writeFile } = await import("node:fs/promises");
  const content = "Example: <!-- ccr:start --> and <!-- ccr:end --> are reserved.\n";
  await writeFile(path.join(root, "CLAUDE.md"), content, "utf8");

  const preview = await previewUninstall(root, false);

  expect(preview.modifyPaths).not.toContain("CLAUDE.md");
  await applyUninstall(root, false, preview);
  expect(await readFile(path.join(root, "CLAUDE.md"), "utf8")).toBe(content);
});

it("should consume a validated uninstall plan and reject later user edits", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-uninstall-plan-"));
  roots.push(root);
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(path.join(root, ".ccr"));
  await writeFile(
    path.join(root, ".ccr/config.json"),
    serializeContextConfig({
      ...DEFAULT_CONTEXT_CONFIG,
      instructions: { updateClaudeMd: true, updateAgentsMd: false, updateDecisionsMd: false },
    }),
    "utf8",
  );
  await applySetup(root);
  const preview = await previewUninstall(root, false);
  await writeFile(path.join(root, "CLAUDE.md"), "user replaced this file\n", "utf8");

  await expect(applyUninstall(root, false, preview)).rejects.toThrow("changed after preview");
  expect(await readFile(path.join(root, "CLAUDE.md"), "utf8")).toBe("user replaced this file\n");
});

it("should preserve a planned removal changed after preview", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-uninstall-removal-plan-"));
  roots.push(root);
  const { writeFile } = await import("node:fs/promises");
  await applySetup(root);
  const preview = await previewUninstall(root, false);
  const skillPath = path.join(root, ".claude/skills/ccr/SKILL.md");
  await writeFile(skillPath, "user replacement\n", "utf8");

  await expect(applyUninstall(root, false, preview)).rejects.toThrow("changed after preview");
  expect(await readFile(skillPath, "utf8")).toBe("user replacement\n");
});
