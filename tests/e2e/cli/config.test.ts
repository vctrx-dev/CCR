import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createCli } from "../../../src/cli/index";
import {
  createTemporaryGitRepository,
  createTemporaryRootRegistry,
} from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();

describe("configuration CLI", () => {
  it("reads resolved local privacy and hook policy and rejects invalid local overrides", async () => {
    const root = await createTemporaryGitRepository(roots, "ccr-config-resolved-");
    let output = "";
    const run = async (args: string[]) => {
      output = "";
      await createCli({
        cwd: root,
        write: (text) => {
          output += text;
        },
      }).parseAsync(["node", "ccr", ...args]);
      return output;
    };
    await run(["setup"]);
    const configPath = path.join(root, ".ccr/config.json");
    const shared = JSON.parse(await readFile(configPath, "utf8"));
    shared.privacy = { excludedPaths: ["shared-private/**"] };
    await writeFile(configPath, JSON.stringify(shared));
    const localPath = path.join(root, ".ccr/config.local.json");
    await writeFile(
      localPath,
      JSON.stringify({
        hooks: { checkBeforeCommit: false },
        privacy: { excludedPaths: ["local-private/**"] },
        context: { recentJournalEntries: 3 },
      }),
    );
    expect(JSON.parse(await run(["config"])).hooks.checkBeforeCommit).toBe(true);
    const resolved = JSON.parse(await run(["config", "--resolved"]));
    expect(resolved.hooks).toMatchObject({ checkBeforeCommit: false, autoUpdateContext: false });
    expect(resolved.context.recentJournalEntries).toBe(3);
    expect(resolved.privacy.excludedPaths).toEqual(
      expect.arrayContaining(["shared-private/**", "local-private/**"]),
    );
    await run(["config", "validate"]);
    await writeFile(localPath, JSON.stringify({ hooks: { checkBeforeCommit: "false" } }));
    await expect(run(["config", "--resolved"])).rejects.toThrow();
    await expect(run(["config", "validate"])).rejects.toThrow();
    expect(JSON.parse(await readFile(configPath, "utf8"))).toEqual(shared);
  });
});
