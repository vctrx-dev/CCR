import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTEXT_CONFIG, serializeContextConfig } from "../../../src/context/config";
import { MANAGED_LIFECYCLE_LOCK_PATH, tryAcquireManagedLock } from "../../../src/context/files";
import { createJournalEntry } from "../../../src/context/journal";
import { applyConfigSetup, applySetup } from "../../../src/context/setup";
import { applyUninstall, previewUninstall } from "../../../src/context/uninstall";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function makeRepository(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-lifecycle-"));
  roots.push(root);
  return root;
}

async function acquireLifecycleLock(root: string): Promise<() => Promise<void>> {
  const release = await tryAcquireManagedLock(root, MANAGED_LIFECYCLE_LOCK_PATH);
  if (release === undefined) throw new Error("Expected lifecycle lock acquisition to succeed.");
  return release;
}

describe("managed lifecycle concurrency", () => {
  it("should make concurrent setup calls converge without duplicate writers", async () => {
    const root = await makeRepository();

    const results = await Promise.all([applySetup(root), applySetup(root)]);

    expect(results.filter(({ changedPaths }) => changedPaths.length > 0)).toHaveLength(1);
    expect(results.filter(({ changedPaths }) => changedPaths.length === 0)).toHaveLength(1);
  });

  it("should wait for another managed lifecycle operation before applying setup", async () => {
    const root = await makeRepository();
    const release = await acquireLifecycleLock(root);
    let isSettled = false;
    const setup = applySetup(root).finally(() => {
      isSettled = true;
    });

    await delay(50);
    const didSettleWhileLocked = isSettled;
    await release();
    await setup;

    expect(didSettleWhileLocked).toBe(false);
    expect(await readFile(path.join(root, ".ccr/config.json"), "utf8")).toBeTruthy();
  });

  it("should recompute config initialization after a concurrent config edit", async () => {
    const root = await makeRepository();
    await applyConfigSetup(root);
    const release = await acquireLifecycleLock(root);
    let isSettled = false;
    const setup = applyConfigSetup(root).finally(() => {
      isSettled = true;
    });

    await delay(50);
    const didSettleWhileLocked = isSettled;
    await writeFile(
      path.join(root, ".ccr/config.json"),
      serializeContextConfig({ ...DEFAULT_CONTEXT_CONFIG, domain: "civic-tech" }),
      "utf8",
    );
    await release();
    await setup;

    const config = JSON.parse(await readFile(path.join(root, ".ccr/config.json"), "utf8"));
    expect(didSettleWhileLocked).toBe(false);
    expect(config.domain).toBe("civic-tech");
  });

  it("should make uninstall wait on the same lock used by setup", async () => {
    const root = await makeRepository();
    await applySetup(root);
    const preview = await previewUninstall(root, false);
    const release = await acquireLifecycleLock(root);
    let isSettled = false;
    const uninstall = applyUninstall(root, false, preview).finally(() => {
      isSettled = true;
    });

    await delay(50);
    const didSettleWhileLocked = isSettled;
    await release();
    await uninstall;

    expect(didSettleWhileLocked).toBe(false);
    await expect(
      readFile(path.join(root, ".claude/skills/ccr/SKILL.md"), "utf8"),
    ).rejects.toThrow();
  });

  it("should preserve local continuity when a journal appears after the uninstall preview", async () => {
    const root = await makeRepository();
    await applySetup(root);
    const preview = await previewUninstall(root, false);
    expect(preview.modifyPaths).toContain(".gitignore");

    const release = await acquireLifecycleLock(root);
    const uninstall = applyUninstall(root, false, preview);
    await delay(50);
    const journal = await createJournalEntry(root, new Date("2026-08-27T12:00:00Z"), {
      branch: "main",
      directory: "main",
      commit: "a".repeat(40),
    });
    await release();

    const applied = await uninstall;
    expect(applied.modifyPaths).not.toContain(".gitignore");
    expect(await readFile(path.join(root, ".gitignore"), "utf8")).toContain(".ccr/journal/");
    expect(await readFile(path.join(root, journal.path), "utf8")).toContain("# CCR Journal");
  });
});
