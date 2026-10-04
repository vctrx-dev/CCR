import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createCli } from "../../../src/cli/index";
import { REVIEW_DIMENSIONS } from "../../../src/review/dimensions";
import {
  createTemporaryGitRepository,
  createTemporaryRootRegistry,
} from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();
const registry = {
  dimensions: ["custom-zeta", "custom-alpha", "custom-middle"].map((id) => ({
    id,
    name: id,
    summary: "Synthetic review scope.",
    criteria: [{ id: "C1", name: "Synthetic criterion", details: "Synthetic question?" }],
  })),
};

async function makeRepository(content = JSON.stringify(registry)): Promise<string> {
  const root = await createTemporaryGitRepository(roots, "ccr-selection-cli-");
  await mkdir(path.join(root, ".ccr/journal"), { recursive: true });
  await writeFile(path.join(root, ".ccr/dimensions.json"), content);
  await writeFile(path.join(root, ".ccr/journal/existing.md"), "Human-owned historical journal.\n");
  return root;
}

async function snapshot(directory: string): Promise<Record<string, string>> {
  const contents: Record<string, string> = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      contents[`${entry.name}/`] = "";
      for (const [relative, content] of Object.entries(await snapshot(file))) {
        contents[`${entry.name}/${relative}`] = content;
      }
    } else {
      contents[entry.name] = (await readFile(file)).toString("base64");
    }
  }
  return contents;
}

async function select(root: string, selection: string): Promise<string> {
  let output = "";
  await createCli({
    cwd: root,
    write: (message: string) => {
      output += message;
    },
  }).parseAsync(["node", "ccr", "context", "dimensions", "--select", selection, "--json"]);
  return output;
}

describe("CLI dimension selection", () => {
  it("should emit only selected live custom dimensions in registry order without writes", async () => {
    const root = await makeRepository();
    const before = await snapshot(path.join(root, ".ccr"));
    expect(JSON.parse(await select(root, " CUSTOM-MIDDLE , Custom-Zeta "))).toEqual({
      dimensions: [registry.dimensions[0], registry.dimensions[2]],
    });
    expect(JSON.parse(await select(root, "ALL"))).toEqual(registry);
    expect(await snapshot(path.join(root, ".ccr"))).toEqual(before);
  });

  it.each(["unknown-lens", "custom-zeta,CUSTOM-ZETA", "all,custom-alpha", ""])(
    "should reject selector %j without output or writes",
    async (selection) => {
      const root = await makeRepository();
      const before = await snapshot(path.join(root, ".ccr"));
      let output = "";
      const cli = createCli({
        cwd: root,
        write: (message: string) => {
          output += message;
        },
      });
      await expect(
        cli.parseAsync(["node", "ccr", "context", "dimensions", "--select", selection, "--json"]),
      ).rejects.toThrow();
      expect(output).toBe("");
      expect(await snapshot(path.join(root, ".ccr"))).toEqual(before);
    },
  );

  it.each(['{"dimensions":[]}', '{"dimensions":[{}]}', "not JSON"])(
    "should reject empty or invalid taxonomy %j without writes",
    async (content) => {
      const root = await makeRepository(content);
      const before = await snapshot(path.join(root, ".ccr"));
      await expect(select(root, "all")).rejects.toThrow();
      expect(await snapshot(path.join(root, ".ccr"))).toEqual(before);
    },
  );

  it("should select packaged dimensions when the live taxonomy is absent without setup", async () => {
    const root = await createTemporaryGitRepository(roots, "ccr-selection-cli-fallback-");
    const dimension = REVIEW_DIMENSIONS.dimensions[0];
    expect(dimension).toBeDefined();
    expect(JSON.parse(await select(root, dimension?.id.toUpperCase() ?? ""))).toEqual({
      dimensions: [dimension],
    });
    await expect(readdir(path.join(root, ".ccr"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
