import { describe, expect, it } from "vitest";
import { CCR_SKILLS } from "../../../src/context/skills";

function skill(id: string): string {
  const definition = CCR_SKILLS.find((candidate) => candidate.id === id);
  if (!definition) throw new Error(`Missing test skill: ${id}`);
  return definition.content;
}

describe("CCR skills", () => {
  it("should provide valid what-and-when metadata for every installed skill", () => {
    for (const definition of CCR_SKILLS) {
      expect(definition.content).toMatch(new RegExp(`^---\\nname: ${definition.id}\\n`));
      expect(definition.content).toMatch(/description: .+Use when .+\n---/s);
    }
  });

  it("should bound context work and distinguish affected people from stored personal data", () => {
    const content = skill("ccr-context");

    expect(content).toContain("<success_criteria>");
    expect(content).toMatch(/initialize.{0,160}project\.md.{0,80}6,000/is);
    expect(content).toMatch(/every operation.{0,160}project\.md.{0,80}6,500/is);
    expect(content).toMatch(/stakeholders\.md.{0,80}2,800/s);
    expect(content).toMatch(/growth reserve/is);
    expect(content).toMatch(/adaptive.{0,100}subagents/is);
    expect(content).toMatch(/parallel.{0,120}(?:independent|evidence traces)/is);
    expect(content).toMatch(/harness.{0,100}concurrency/is);
    expect(content).toMatch(/starting guidance.{0,160}not.{0,80}(?:hard|ceiling)/is);
    expect(content).toMatch(
      /(?:unsupported|contradicted|truncated).{0,220}(?:expand|additional)/is,
    );
    expect(content).toMatch(/evidence completeness.{0,240}(?:stop|finish)/is);
    expect(content).toMatch(/planning targets.{0,80}not a stop condition/is);
    expect(content).toMatch(/configuration data/i);
    expect(content).toMatch(/does not prove that user responses or\s+identities are stored/);
    expect(content).not.toMatch(/student|teacher|FERPA|educational/i);
    expect(content).toMatch(/author(?:ship)?.{0,120}write path/is);
    expect(content).toMatch(/contract.{0,120}implementation/is);
    expect(content).toMatch(/every member.{0,120}(?:aggregate|common|shared)/is);
    expect(content).toMatch(/open question.{0,160}recent (?:changes|history)/is);
    expect(content).toMatch(/do not speculate.{0,100}(?:file|location|cause)/is);
    expect(content).toMatch(/journal.{0,120}matching.{0,80}HEAD/is);
    expect(content).toMatch(/create.{0,100}journal.{0,120}only when.{0,80}(?:none|no matching)/is);
    expect(content).toMatch(/never delete.{0,100}(?:pre-existing|existing).{0,40}journal/is);
    expect(content).toMatch(/exact (?:live )?file.{0,120}(?:directory|glob)/is);
    expect(content).toMatch(/focused.{0,160}(?:zero|no)\s+discovery subagents/is);
    expect(content).toMatch(/(?:five|5) minutes.{0,160}(?:update|verify|addition)/is);
    expect(content).toMatch(/(?:eight|8) minutes.{0,160}compact/is);
    expect(content).toMatch(/tool-free verifier.{0,200}every operation/is);
    expect(content).toMatch(/evidence packet.{0,200}verifier uses no tools/is);
    expect(content).not.toMatch(/verifier may use at most (?:six|6) broker reads/i);
    expect(content).toMatch(/draft.{0,160}memory.{0,160}verifier/is);
    expect(content).toMatch(/never.{0,120}(?:scratch|temp).{0,120}repository root/is);
    expect(content).toMatch(/\.ccr\/tmp.{0,200}remove/is);
    expect(content).toMatch(/scan.{0,160}(?:wildcard|brace|directory)/is);
    expect(content).toMatch(/bare basename.{0,160}repository-relative path/is);
    expect(content).toMatch(/workflow.{0,160}enumerate every.{0,160}trigger/is);
    expect(content).toMatch(/supported runtime.{0,160}(?:CI|build gate)/is);
    expect(content).toMatch(/did not claim.{0,160}does not exist/is);
    expect(content).toMatch(/absence claim.{0,200}(?:exhaustive|searchable) boundary/is);
    expect(content).toMatch(/compact.{0,160}modifier.{0,100}ambiguous/is);
    expect(content.match(/<example>/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(content).toContain("/ccr-hooks sync");
  });

  it("should make hook strategy a repository-aware skill decision", () => {
    const content = skill("ccr-hooks");

    expect(content).toContain("sync");
    expect(content).toContain("status");
    expect(content).toContain("remove");
    expect(content).toContain("core.hooksPath");
    expect(content).toContain(".pre-commit-config.yaml");
    expect(content).toContain("existing hook interpreter");
    expect(content).toContain("repository-native");
    expect(content).toContain(".ccr/private/hooks-state.json");
    expect(content).toMatch(/before first sync.{0,200}existed|existed.{0,80}before first sync/is);
    expect(content).toMatch(
      /(?:state|provenance).{0,40}missing.{0,160}(?:retain|never delete)|missing.{0,100}(?:state|provenance).{0,160}(?:retain|never delete)/is,
    );
    expect(content).toMatch(
      /pre-existing.{0,120}byte-for-byte|byte-for-byte.{0,120}pre-existing/is,
    );
    expect(content).toMatch(/separatorByteCount/is);
    expect(content).toMatch(/originalByteLength/is);
    expect(content).toMatch(/originalSha256/is);
    expect(content).toMatch(/hash.{0,120}mismatch.{0,160}(?:retain|keep).{0,80}state/is);
    expect(content).toMatch(/(?:five|5)-second.{0,120}(?:executable|probe)/is);
    expect(content).toMatch(/never execute.{0,120}(?:pre-commit|hook)/is);
    expect(content).toMatch(
      /linked worktree.{0,180}(?:common|git-common-dir).{0,120}(?:allow|valid)/is,
    );
    expect(content).toMatch(/configured.{0,100}outside.{0,100}(?:unsupported|do not edit)/is);
    expect(content).toMatch(/CLI.{0,160}(?:legacy|provenance).{0,160}(?:cannot|does not)/is);
    expect(content).toMatch(/keep the state file.{0,120}(?:pending|failed|incomplete)/is);
    expect(content).not.toContain(
      "`hooks.enabled: false` means run `npx --no-install ccr hooks uninstall --apply` and stop.",
    );
    expect(content.match(/<example>/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it("should review selected change dimensions with adaptive subagents and structured findings", () => {
    const content = skill("ccr-review");

    expect(content).toContain("references/dimensions.md");
    expect(content).toMatch(/default.{0,80}all/is);
    expect(content).toMatch(/comma.{0,80}(?:dimension|selection)/is);
    expect(content).toMatch(/unknown.{0,100}(?:dimension|identifier)/is);
    expect(content).toMatch(/relatedDimensions.{0,160}(?:group|cluster|subagent)/is);
    expect(content).toMatch(/adaptive.{0,120}subagents/is);
    expect(content).toMatch(/not.{0,80}(?:one|1).{0,80}subagent.{0,80}(?:dimension|each)/is);
    expect(content).toContain("context review-changes");
    expect(content).toContain("context review-diff");
    expect(content).toContain(".ccr/project.md");
    expect(content).toContain(".ccr/stakeholders.md");
    expect(content).toContain("context journals");
    expect(content).toContain("context review-journal");
    expect(content).toMatch(/Severity:\s*<severity>/s);
    expect(content).toMatch(/File:\s*<repository-relative path>/s);
    expect(content).toMatch(/Issue:\s*<issue>/s);
    expect(content).toMatch(/Case:\s*<triggering condition>/s);
    expect(content).toMatch(/do not.{0,100}(?:fix|modify).{0,100}(?:source|code)/is);
    expect(content.match(/<example>/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it("should review the complete codebase with the same dimension and journal contracts", () => {
    const content = skill("ccr-codebase");

    expect(content).toContain("references/dimensions.md");
    expect(content).toContain("context files");
    expect(content).toContain("context read");
    expect(content).toContain("nextCursor");
    expect(content).toContain("context review-changes");
    expect(content).toMatch(/end-to-end|E2E/i);
    expect(content).toMatch(/coverage ledger/i);
    expect(content).toMatch(/adaptive.{0,120}subagents/is);
    expect(content).toContain("context review-journal");
    expect(content).toMatch(/do not.{0,100}(?:fix|modify).{0,100}(?:source|code)/is);
    expect(content.match(/<example>/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });
});
