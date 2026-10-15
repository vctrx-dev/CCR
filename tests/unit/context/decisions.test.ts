import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { DEFAULT_CONTEXT_CONFIG, toPublicContextConfig } from "../../../src/context/config";
import { appendDecision } from "../../../src/context/decisions";
import { createTemporaryRootRegistry } from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();

async function makeContext(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-decisions-"));
  roots.push(root);
  await mkdir(path.join(root, ".ccr"));
  await writeFile(
    path.join(root, ".ccr/config.json"),
    JSON.stringify({
      ...toPublicContextConfig(DEFAULT_CONTEXT_CONFIG),
      instructions: { updateClaudeMd: false, updateAgentsMd: false },
    }),
    "utf8",
  );
  await writeFile(path.join(root, ".ccr/decisions.md"), "", "utf8");
  return root;
}

it("should append one bounded decision line", async () => {
  const root = await makeContext();

  await appendDecision(root, "  Keep the advisory review workflow.  ");

  expect(await readFile(path.join(root, ".ccr/decisions.md"), "utf8")).toBe(
    "- Keep the advisory review workflow.\n",
  );
});

it("should keep an identical normalized decision idempotent", async () => {
  const root = await makeContext();

  await appendDecision(root, "Keep reviews advisory.");
  await appendDecision(root, "  Keep reviews advisory.  ");

  expect(await readFile(path.join(root, ".ccr/decisions.md"), "utf8")).toBe(
    "- Keep reviews advisory.\n",
  );
});
