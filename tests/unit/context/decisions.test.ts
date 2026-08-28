import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { DEFAULT_CONTEXT_CONFIG, toPublicContextConfig } from "../../../src/context/config";
import { appendDecision } from "../../../src/context/decisions";
import { createTemporaryRootRegistry } from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();

async function makeContext(updateDecisionsMd: boolean): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-decisions-"));
  roots.push(root);
  await mkdir(path.join(root, ".ccr"));
  await writeFile(
    path.join(root, ".ccr/config.json"),
    JSON.stringify({
      ...toPublicContextConfig(DEFAULT_CONTEXT_CONFIG),
      instructions: { updateClaudeMd: false, updateAgentsMd: false, updateDecisionsMd },
    }),
    "utf8",
  );
  await writeFile(path.join(root, ".ccr/decisions.md"), "", "utf8");
  return root;
}

it("should reject decision updates unless the explicit opt-in is enabled", async () => {
  const root = await makeContext(false);

  await expect(appendDecision(root, "Use the advisory review workflow.")).rejects.toThrow(
    "instructions.updateDecisionsMd is false",
  );
  expect(await readFile(path.join(root, ".ccr/decisions.md"), "utf8")).toBe("");
});

it("should append one bounded decision line when the opt-in is enabled", async () => {
  const root = await makeContext(true);

  await appendDecision(root, "  Keep the advisory review workflow.  ");

  expect(await readFile(path.join(root, ".ccr/decisions.md"), "utf8")).toBe(
    "- Keep the advisory review workflow.\n",
  );
});

it("should reject multi-line decisions", async () => {
  const root = await makeContext(true);

  await expect(appendDecision(root, "First line\nSecond line")).rejects.toThrow("one line");
});

it("should not append beyond the final document limit", async () => {
  const root = await makeContext(true);
  const decisionsPath = path.join(root, ".ccr/decisions.md");
  const existing = "x".repeat(10_000);
  await writeFile(decisionsPath, existing, "utf8");

  await expect(appendDecision(root, "Another durable decision.")).rejects.toThrow(
    "exceed 10000 characters",
  );
  expect(await readFile(decisionsPath, "utf8")).toBe(existing);
});

it("should keep an identical normalized decision idempotent", async () => {
  const root = await makeContext(true);

  await appendDecision(root, "Keep reviews advisory.");
  await appendDecision(root, "  Keep reviews advisory.  ");

  expect(await readFile(path.join(root, ".ccr/decisions.md"), "utf8")).toBe(
    "- Keep reviews advisory.\n",
  );
});

it("should preserve distinct decisions appended concurrently", async () => {
  const root = await makeContext(true);
  const decisions = Array.from({ length: 12 }, (_, index) => `Concurrent decision ${index}.`);

  await Promise.all(decisions.map((decision) => appendDecision(root, decision)));

  const content = await readFile(path.join(root, ".ccr/decisions.md"), "utf8");
  expect(new Set(content.trim().split("\n"))).toEqual(
    new Set(decisions.map((decision) => `- ${decision}`)),
  );
});

it("should converge identical decisions appended concurrently", async () => {
  const root = await makeContext(true);

  await Promise.all(
    Array.from({ length: 12 }, () => appendDecision(root, "Keep reviews advisory.")),
  );

  expect(await readFile(path.join(root, ".ccr/decisions.md"), "utf8")).toBe(
    "- Keep reviews advisory.\n",
  );
});

it("should reject one concurrent append when only one entry fits the document bound", async () => {
  const root = await makeContext(true);
  const decisionsPath = path.join(root, ".ccr/decisions.md");
  await writeFile(decisionsPath, "x".repeat(9_970), "utf8");

  const results = await Promise.allSettled([
    appendDecision(root, "First concurrent choice."),
    appendDecision(root, "Second concurrent choice."),
  ]);

  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  expect((await readFile(decisionsPath, "utf8")).length).toBeLessThanOrEqual(10_000);
});

it("should reject malformed decision document text without replacing it", async () => {
  const root = await makeContext(true);
  const decisionsPath = path.join(root, ".ccr/decisions.md");
  const malformed = Buffer.concat([Buffer.from("- Human decision.\n", "utf8"), Buffer.from([255])]);
  await writeFile(decisionsPath, malformed);

  await expect(appendDecision(root, "Another durable decision.")).rejects.toThrow(
    "valid UTF-8 text",
  );
  expect(await readFile(decisionsPath)).toEqual(malformed);
});
