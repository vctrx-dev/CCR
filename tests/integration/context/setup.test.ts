import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTEXT_CONFIG, serializeContextConfig } from "../../../src/context/config";
import { applyConfigSetup, applySetup, previewSetup } from "../../../src/context/setup";

const roots: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function makeRepository(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-setup-"));
  roots.push(root);
  return root;
}

describe("CCR setup", () => {
  it("should preview every change without writing files", async () => {
    const root = await makeRepository();
    const preview = await previewSetup(root);

    expect(preview.changes.map((change) => change.path)).toContain(".ccr/config.json");
    expect(preview.changes.map((change) => change.path)).toContain(".ccr/config-manual.md");
    expect(preview.changes.map((change) => change.path)).toContain(".claude/skills/ccr/SKILL.md");
    expect(preview.changes.map((change) => change.path)).toContain(
      ".claude/skills/ccr-context/SKILL.md",
    );
    expect(preview.changes.map((change) => change.path)).not.toContain(".ccr/risks.md");
    expect(preview.changes.map((change) => change.path)).not.toContain(".ccr/architecture.md");
    expect(preview.changes.map((change) => change.path)).not.toContain(".ccr/decisions.md");
    expect(preview.changes.map((change) => change.path)).not.toContain("CLAUDE.md");
    await expect(readFile(path.join(root, ".ccr/config.json"), "utf8")).rejects.toThrow();
  });

  it("should preserve existing instructions when integration is opted in", async () => {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const root = await makeRepository();
    await mkdir(path.join(root, ".ccr"));
    await writeFile(
      path.join(root, ".ccr/config.json"),
      serializeContextConfig({
        ...DEFAULT_CONTEXT_CONFIG,
        instructions: { updateClaudeMd: true, updateAgentsMd: false },
      }),
      "utf8",
    );
    await writeFile(path.join(root, "CLAUDE.md"), "# Existing instructions\n", "utf8");

    const first = await applySetup(root);
    const second = await applySetup(root);
    const instructions = await readFile(path.join(root, "CLAUDE.md"), "utf8");

    expect(first.changedPaths.length).toBeGreaterThan(0);
    expect(second.changedPaths).toEqual([]);
    expect(instructions).toContain("# Existing instructions");
    expect(instructions.match(/<!-- ccr:start -->/g)).toHaveLength(1);
  });

  it("should not overwrite existing context", async () => {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const root = await makeRepository();
    const projectPath = path.join(root, ".ccr/project.md");
    await mkdir(path.dirname(projectPath), { recursive: true });
    await writeFile(projectPath, "# Team-owned context\n", "utf8");

    await applySetup(root);

    expect(await readFile(projectPath, "utf8")).toBe("# Team-owned context\n");
  });

  it("should honor instruction-file choices made before setup", async () => {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const root = await makeRepository();
    await mkdir(path.join(root, ".ccr"));
    await writeFile(
      path.join(root, ".ccr/config.json"),
      serializeContextConfig({
        ...DEFAULT_CONTEXT_CONFIG,
        instructions: { updateClaudeMd: false, updateAgentsMd: true },
      }),
      "utf8",
    );

    const paths = (await previewSetup(root)).changes.map((change) => change.path);

    expect(paths).not.toContain("CLAUDE.md");
    expect(paths).toContain("AGENTS.md");
  });

  it("should read an older config without rewriting the human-owned file", async () => {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const root = await makeRepository();
    await mkdir(path.join(root, ".ccr"));
    await writeFile(
      path.join(root, ".ccr/config.json"),
      `${JSON.stringify({
        schemaVersion: 1,
        domain: "education",
        automation: { mode: "warn", checkBeforeCommit: false },
        context: {
          maxIndexCharacters: 6000,
          maxFileCharacters: 10_000,
          recentJournalEntries: 2,
        },
        privacy: {
          providerPolicy: "claude-code-only",
          excludedPaths: [".env*"],
        },
        instructions: { updateClaudeMd: false, updateAgentsMd: false },
      })}\n`,
      "utf8",
    );

    const preview = await previewSetup(root);
    expect(preview.config.hooks).toEqual({ enabled: true, checkBeforeCommit: false });
    expect(preview.changes.find((change) => change.path === ".ccr/config.json")?.action).toBe(
      "preserve",
    );
    await applySetup(root);
    const config = JSON.parse(await readFile(path.join(root, ".ccr/config.json"), "utf8"));
    expect(config.domain).toBe("education");
    expect(config.automation.checkBeforeCommit).toBe(false);
    expect(config.context.recentJournalEntries).toBe(2);
    expect(config.schemaVersion).toBe(1);
    expect(config.discovery).toBeUndefined();

    const explicitUpgrade = await applyConfigSetup(root);
    const upgraded = JSON.parse(await readFile(path.join(root, ".ccr/config.json"), "utf8"));
    expect(explicitUpgrade.config.action).toBe("modify");
    expect(explicitUpgrade.manual.action).toBe("unchanged");
    expect(upgraded.schemaVersion).toBeUndefined();
    expect(upgraded._help).toBeUndefined();
    expect(upgraded._comment).toBeUndefined();
    expect(upgraded.hooks).toEqual({ enabled: true, checkBeforeCommit: false });
    expect(upgraded.discovery).toBeUndefined();
    expect(upgraded.privacy).toBeUndefined();
  });

  it("should update config without depending on unrelated managed files", async () => {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const root = await makeRepository();
    await mkdir(path.join(root, ".ccr"));
    await writeFile(
      path.join(root, ".ccr/config.json"),
      `${JSON.stringify({
        schemaVersion: 1,
        domain: "education",
        automation: { mode: "warn", checkBeforeCommit: true },
        context: { maxIndexCharacters: 6000, maxFileCharacters: 10_000, recentJournalEntries: 2 },
        privacy: { providerPolicy: "claude-code-only", excludedPaths: [".env*"] },
        instructions: { updateClaudeMd: false, updateAgentsMd: false },
      })}\n`,
      "utf8",
    );
    await writeFile(
      path.join(root, ".gitignore"),
      "# ccr:start - local context continuity\n.ccr/journal/\n",
      "utf8",
    );

    const result = await applyConfigSetup(root);

    expect(result.config.action).toBe("modify");
    expect(result.manual.action).toBe("create");
    expect(JSON.parse(await readFile(path.join(root, ".ccr/config.json"), "utf8"))).toMatchObject({
      domain: "education",
      hooks: { enabled: true, checkBeforeCommit: true },
      context: { recentJournalEntries: 2 },
    });
  });

  it("should update only a package-managed Claude skill", async () => {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const root = await makeRepository();
    const skillPath = path.join(root, ".claude/skills/ccr-context/SKILL.md");
    await mkdir(path.dirname(skillPath), { recursive: true });
    await writeFile(
      skillPath,
      "<!-- managed by CCR skill; package updates may replace this file -->\nold\n",
      "utf8",
    );

    const result = await applySetup(root);

    expect(result.changedPaths).toContain(".claude/skills/ccr-context/SKILL.md");
    const skill = await readFile(skillPath, "utf8");
    expect(skill).toContain("`initialize`, `update`, `verify`, `addition`, or `compact`");
    expect(skill).toContain("optional context that is not in this repository");
    expect(skill).toContain("parallel discovery subagents");
    expect(skill).toContain("verification subagent");
    expect(skill).toContain("single, connected project narrative");
    expect(skill).toContain("small but consequential");
    expect(skill).toContain("fixed category sections");
    expect(skill).toMatch(/stop\s+immediately/);
    expect(skill).toContain("Normalize `initialise`");
    expect(skill).toContain("Never edit `.ccr/config.json`");
    expect(skill).toContain("20% and 30%");
    expect(skill).toMatch(/Please review the resulting `\.ccr`\s+context changes/);
    expect(skill).not.toContain(".ccr/architecture.md");
    expect(skill).not.toContain(".ccr/decisions.md");

    const project = await readFile(path.join(root, ".ccr/project.md"), "utf8");
    expect(project).toContain("living, evidence-backed narrative");
    expect(project).toMatch(/Do not divide the account\s+into fixed categories/);

    const manual = await readFile(path.join(root, ".claude/skills/ccr/SKILL.md"), "utf8");
    expect(manual).toContain("CCR manual");
    expect(manual).toContain("/ccr-context");
    expect(manual).toContain("/ccr-review");
    expect(manual).not.toContain("## Initialize");
  });

  it("should preserve a skill with a foreign marker", async () => {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const root = await makeRepository();
    const skillPath = path.join(root, ".claude/skills/ccr/SKILL.md");
    const foreignContent = "<!-- managed by CCR skill; foreign tool -->\nCustom skill\n";
    await mkdir(path.dirname(skillPath), { recursive: true });
    await writeFile(skillPath, foreignContent, "utf8");

    await expect(previewSetup(root)).rejects.toThrow("managed file conflict");
    expect(await readFile(skillPath, "utf8")).toBe(foreignContent);
  });

  it("should reject malformed managed markers instead of appending a second block", async () => {
    const { writeFile } = await import("node:fs/promises");
    const root = await makeRepository();
    await writeFile(
      path.join(root, ".gitignore"),
      "# ccr:start - local context continuity\n.ccr/journal/\n",
      "utf8",
    );

    await expect(previewSetup(root)).rejects.toThrow("managed block conflict in .gitignore");
  });

  it("should refuse a managed directory that redirects outside the repository", async () => {
    const { symlink } = await import("node:fs/promises");
    const root = await makeRepository();
    const outside = await makeRepository();
    await symlink(outside, path.join(root, ".ccr"), "junction");

    await expect(applySetup(root)).rejects.toThrow("crosses a symbolic link");
    await expect(readFile(path.join(outside, "config.json"), "utf8")).rejects.toThrow();
  });
});
