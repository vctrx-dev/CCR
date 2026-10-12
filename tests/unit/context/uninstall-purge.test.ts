import type { PathLike } from "node:fs";
import { mkdir, mkdtemp, open, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyPurgeTree, snapshotPurgeTree } from "../../../src/context/uninstall-purge";
import { createTemporaryRootRegistry } from "../../helpers/test-environment";

const overrides = vi.hoisted(() => ({ devices: new Map<string, number>() }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...original,
    lstat: async (file: PathLike) => {
      const stats = await original.lstat(file);
      const device = overrides.devices.get(String(file));
      if (device !== undefined) stats.dev = device;
      return stats;
    },
  };
});

const roots = createTemporaryRootRegistry();
afterEach(() => overrides.devices.clear());

async function fixture(): Promise<{ root: string; file: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-purge-device-"));
  roots.push(root);
  await mkdir(path.join(root, ".ccr"));
  const file = path.join(root, ".ccr", "data.bin");
  await writeFile(file, Buffer.from([0, 255, 1, 128]));
  return { root, file };
}

describe("purge file identity across path and handle stats", () => {
  it("previews and removes unchanged data when path stats omit the device", async () => {
    const { root, file } = await fixture();
    overrides.devices.set(file, 0);
    const snapshot = await snapshotPurgeTree(root);
    expect(snapshot.files.has(".ccr/data.bin")).toBe(true);
    await applyPurgeTree(root, snapshot);
    await expect(readFile(file)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a different reported device before removing data", async () => {
    const { root, file } = await fixture();
    const handle = await open(file, "r");
    const device = (await handle.stat()).dev;
    await handle.close();
    overrides.devices.set(file, device === 1 ? 2 : 1);
    await expect(snapshotPurgeTree(root)).rejects.toThrow(/path changed while reading/);
    expect(await readFile(file)).toEqual(Buffer.from([0, 255, 1, 128]));
  });
});
