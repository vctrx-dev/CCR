import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readHookState } from "../../../src/context/hook-state";
import { createTemporaryRootRegistry } from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();

async function createRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-hook-state-"));
  roots.push(root);
  await mkdir(path.join(root, ".ccr/private"), { recursive: true });
  return root;
}

describe("readHookState", () => {
  it("should reject oversized provenance before parsing it", async () => {
    const root = await createRoot();
    await writeFile(path.join(root, ".ccr/private/hooks-state.json"), "x".repeat(65_537), "utf8");

    await expect(readHookState(root)).resolves.toEqual({
      issue: "state exceeds the 65536-character limit",
      status: "invalid",
    });
  });

  it("should distinguish missing, invalid, and valid deterministic provenance", async () => {
    const root = await createRoot();
    expect(await readHookState(root)).toEqual({ status: "missing" });

    await writeFile(path.join(root, ".ccr/private/hooks-state.json"), "{}\n", "utf8");
    expect(await readHookState(root)).toMatchObject({ status: "invalid" });

    await writeFile(
      path.join(root, ".ccr/private/hooks-state.json"),
      `${JSON.stringify({
        schemaVersion: 1,
        strategy: "minimal-posix",
        strategyDescription: "Created minimal POSIX hooks for both Git events.",
        frameworkSourcePath: null,
        ccrEntryId: null,
        artifacts: [
          {
            events: ["pre-commit"],
            path: ".git/hooks/pre-commit",
            existed: false,
            originalByteLength: 0,
            originalSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            separatorByteCount: 0,
          },
          {
            events: ["post-commit"],
            path: ".git/hooks/post-commit",
            existed: false,
            originalByteLength: 0,
            originalSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            separatorByteCount: 0,
          },
        ],
      })}\n`,
      "utf8",
    );
    expect(await readHookState(root)).toMatchObject({
      state: { strategy: "minimal-posix" },
      status: "valid",
    });
  });

  it("should reject inferred or structurally inconsistent provenance", async () => {
    const root = await createRoot();
    await writeFile(
      path.join(root, ".ccr/private/hooks-state.json"),
      `${JSON.stringify({
        schemaVersion: 1,
        strategy: "native-posix",
        artifacts: [
          {
            path: ".git/hooks/pre-commit",
            existed: true,
            originalByteLength: 10,
            originalSha256: "a8076d3d28d21e02012b20eaf7dbf75409a6277134439025f282e368e3305abf",
            separatorByteCount: 0,
          },
        ],
      })}\n`,
      "utf8",
    );

    expect(await readHookState(root)).toMatchObject({ status: "invalid" });
  });
});
