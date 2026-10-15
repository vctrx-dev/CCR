import type { Command } from "commander";
import { describe, expect, it } from "vitest";
import { createCli } from "../../../src/cli/index";
import { CCR_SKILLS } from "../../../src/context/skills";

describe("shipped skill command contracts", () => {
  it("uses real CLI command paths and flags in every inline support example", () => {
    const cli = createCli();
    for (const skill of CCR_SKILLS) {
      for (const match of skill.content.matchAll(/`ccr ([^`\r\n]+)`/gu)) {
        const tokens = (match[1] ?? "").split(/\s+/u);
        if (tokens[0]?.startsWith("<")) continue;
        let command: Command = cli;
        const example = `${skill.id}: ${match[0]}`;
        while (command.commands.length > 0 && tokens[0] && /^[a-z][a-z-]*$/u.test(tokens[0])) {
          const name = tokens.shift();
          const child = command.commands.find((candidate) => candidate.name() === name);
          expect(child, example).toBeDefined();
          if (!child) break;
          command = child;
        }
        for (const flag of tokens.filter((token) => token.startsWith("--"))) {
          expect(
            flag === "--help" || command.options.some((option) => option.long === flag),
            example,
          ).toBe(true);
        }
      }
      expect(skill.content, skill.id).toContain("node .ccr/private/runtime/dist/cli/index.cjs");
      expect(skill.content, skill.id).not.toMatch(/\bnpx\b|--no-install/u);
    }
  });
});
