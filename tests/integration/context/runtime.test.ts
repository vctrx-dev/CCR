import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  RUNTIME_CLI_PATH,
  readPackagedRuntimeSourcePath,
  readRuntimeArtifacts,
} from "../../../src/context/runtime";
import { applySetup, previewSetup } from "../../../src/context/setup";
import { applyUninstall, previewUninstall } from "../../../src/context/uninstall";
import { createTemporaryRootRegistry } from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-runtime-"));
  roots.push(root);
  const cliPath = path.join(root, "bundled-cli.cjs");
  const content = "#!/usr/bin/env node\n// bundled CCR CLI\n";
  await writeFile(cliPath, content);
  return { root, cliPath, content };
}

describe("setup runtime", () => {
  it("finds the shipped CLI for SDK and CLI bundles while leaving unbundled sources injectable", async () => {
    const { root } = await fixture();
    await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "@vctrx/ccr" }));
    for (const entry of ["dist/index.cjs", "dist/chunk.js", "dist/cli/index.cjs"]) {
      expect(await readPackagedRuntimeSourcePath(path.join(root, entry))).toBe(
        path.join(root, "dist/cli/index.cjs"),
      );
    }
    expect(await readPackagedRuntimeSourcePath()).toBeUndefined();
    await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "unrelated" }));
    await expect(readPackagedRuntimeSourcePath(path.join(root, "dist/index.cjs"))).rejects.toThrow(
      "bundled runtime",
    );
    await writeFile(path.join(root, "package.json"), "invalid JSON");
    await expect(
      readPackagedRuntimeSourcePath(path.join(root, "dist/index.cjs")),
    ).rejects.toThrow();
  });

  it("previews without writes, retains its bundle and taxonomy, and refreshes idempotently", async () => {
    const { root, cliPath, content } = await fixture();
    const preview = await previewSetup(root, cliPath);
    expect(preview.changes.map(({ path }) => path)).toContain(RUNTIME_CLI_PATH);
    await expect(readFile(path.join(root, RUNTIME_CLI_PATH))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await applySetup(root, preview);
    expect(await readFile(path.join(root, RUNTIME_CLI_PATH), "utf8")).toBe(content);
    const metadata = JSON.parse(
      await readFile(path.join(root, ".ccr/private/runtime/package.json"), "utf8"),
    );
    expect(metadata.name).toBe("@vctrx/ccr");
    const dimensions = JSON.parse(
      await readFile(path.join(root, ".ccr/private/runtime/dist/review/dimensions.json"), "utf8"),
    );
    expect(dimensions.dimensions.length).toBeGreaterThan(0);
    expect((await applySetup(root, await previewSetup(root, cliPath))).changedPaths).toEqual([]);
    await writeFile(cliPath, `${content}// newer version\n`);
    expect((await applySetup(root, await previewSetup(root, cliPath))).changedPaths).toEqual([
      RUNTIME_CLI_PATH,
    ]);
  });

  it("rejects missing, invalid, binary, and oversized bundles before applying setup", async () => {
    const { root, cliPath } = await fixture();
    await expect(readRuntimeArtifacts(path.join(root, "missing.cjs"))).rejects.toThrow(
      "bundled runtime",
    );
    for (const content of [
      "not a CLI",
      "#!/usr/bin/env node\n\0",
      `#!/usr/bin/env node\n${"x".repeat(5_000_001)}`,
    ]) {
      await writeFile(cliPath, content);
      await expect(previewSetup(root, cliPath)).rejects.toThrow("bundled runtime");
      await expect(readFile(path.join(root, ".ccr/config.json"))).rejects.toMatchObject({
        code: "ENOENT",
      });
    }
  });

  it("rejects a symlinked runtime directory", async () => {
    const { root, cliPath } = await fixture();
    const outside = await mkdtemp(path.join(tmpdir(), "ccr-runtime-outside-"));
    roots.push(outside);
    await mkdir(path.join(root, ".ccr/private"), { recursive: true });
    await symlink(
      outside,
      path.join(root, ".ccr/private/runtime"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await expect(previewSetup(root, cliPath)).rejects.toThrow("symbolic link");
  });

  it("preserves runtime with context and removes it on explicit programmatic context removal", async () => {
    const { root, cliPath } = await fixture();
    await applySetup(root, await previewSetup(root, cliPath));
    expect((await previewUninstall(root, false)).removePaths).not.toContain(RUNTIME_CLI_PATH);
    expect((await previewUninstall(root, true)).removePaths).toContain(RUNTIME_CLI_PATH);
    await applyUninstall(root, true);
    await expect(readFile(path.join(root, RUNTIME_CLI_PATH))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
