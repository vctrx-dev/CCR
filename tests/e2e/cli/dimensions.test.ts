import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import { createCli } from "../../../src/cli/index";
import {
  createTemporaryGitRepository,
  createTemporaryRootRegistry,
} from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();

it("should render current repository taxonomy without setup or mutation after local edits", async () => {
  const root = await createTemporaryGitRepository(roots, "ccr-dimensions-cli-");
  let output = "";
  const io = {
    cwd: root,
    write: (message: string) => {
      output += message;
    },
  };
  await createCli(io).parseAsync(["node", "ccr", "setup"]);
  const file = path.join(root, ".ccr/dimensions.json");
  const registry = {
    dimensions: [
      {
        id: "custom-example",
        name: "Custom example",
        summary: "Sample scope.",
        criteria: [{ id: "X1", name: "Sample criterion", details: "Sample question?" }],
      },
    ],
  };
  const content = JSON.stringify(registry);
  await writeFile(file, content);
  output = "";
  await createCli(io).parseAsync(["node", "ccr", "context", "dimensions", "--json"]);
  expect(JSON.parse(output)).toEqual(registry);
  output = "";
  await createCli(io).parseAsync(["node", "ccr", "context", "dimensions"]);
  const before = output;
  await writeFile(file, content.replace("Sample question?", "Updated question?"));
  output = "";
  await createCli(io).parseAsync(["node", "ccr", "context", "dimensions"]);
  expect(output).not.toBe(before);
  expect(await readFile(file, "utf8")).toBe(
    content.replace("Sample question?", "Updated question?"),
  );
  await writeFile(file, "PRIVATE123");
  output = "";
  await expect(createCli(io).parseAsync(["node", "ccr", "context", "dimensions"])).rejects.toThrow(
    /JSON/u,
  );
  expect(output).toBe("");
});
