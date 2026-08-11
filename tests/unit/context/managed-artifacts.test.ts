import { describe, expect, it } from "vitest";
import {
  MANAGED_ARTIFACTS,
  MANAGED_BLOCK_ARTIFACTS,
  isPackageManagedSkill,
} from "../../../src/context/managed-artifacts";
import { MANAGED_SKILL_MARKER } from "../../../src/context/skills";

describe("managed artifact registry", () => {
  it("should provide unique lifecycle entries for context and skills", () => {
    const paths = MANAGED_ARTIFACTS.map((artifact) => artifact.path);

    expect(new Set(paths).size).toBe(paths.length);
    expect(MANAGED_ARTIFACTS.some((artifact) => artifact.path === ".ccr/config-manual.md")).toBe(
      true,
    );
    expect(MANAGED_ARTIFACTS.some((artifact) => artifact.path === ".ccr/project.md")).toBe(true);
    expect(MANAGED_ARTIFACTS.some((artifact) => artifact.kind === "skill")).toBe(true);
    expect(
      MANAGED_ARTIFACTS.some((artifact) => artifact.path === ".claude/skills/ccr-hooks/SKILL.md"),
    ).toBe(true);
    expect(MANAGED_BLOCK_ARTIFACTS.map((artifact) => artifact.path)).toEqual([
      ".gitignore",
      "CLAUDE.md",
      "AGENTS.md",
    ]);
  });

  it("should recognize exactly one package ownership marker", () => {
    const managed = `---\nname: ccr-example\ndescription: Example\n---\n\n${MANAGED_SKILL_MARKER}\n# Skill\n`;
    expect(isPackageManagedSkill(managed)).toBe(true);
    expect(isPackageManagedSkill(`${managed}\n${MANAGED_SKILL_MARKER}`)).toBe(false);
    expect(isPackageManagedSkill(`${MANAGED_SKILL_MARKER}\n${managed}`)).toBe(false);
    expect(
      isPackageManagedSkill(
        `---\nname: custom\ndescription: Quotes a marker\n---\n\n# Skill\n\`${MANAGED_SKILL_MARKER}\`\n`,
      ),
    ).toBe(false);
  });
});
