import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import {
  launchAutomaticContextUpdate,
  recordAutomaticUpdateFailure,
  takeAutomaticUpdateFailure,
} from "../../../src/context/automatic-context-launcher";
import { createTemporaryRootRegistry } from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();

it("should report a background failure exactly once", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-auto-launcher-"));
  roots.push(root);

  expect(await takeAutomaticUpdateFailure(root)).toBe(false);
  await recordAutomaticUpdateFailure(root, "a".repeat(40));
  expect(await takeAutomaticUpdateFailure(root)).toBe(true);
  expect(await takeAutomaticUpdateFailure(root)).toBe(false);
});

it("should not start a background update without a CLI entry point", () => {
  expect(launchAutomaticContextUpdate(tmpdir(), "a".repeat(40), "journal.md", "")).toBe(false);
});
