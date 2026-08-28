import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ensureLocalIgnoreRules, localIgnoreContent } from "../../../src/context/ignore";
import { createTemporaryRootRegistry } from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();

describe("localIgnoreContent", () => {
  it("should append the local-continuity block to an existing .gitignore", () => {
    const result = localIgnoreContent("node_modules/\n");
    expect(result.startsWith("node_modules/\n")).toBe(true);
    expect(result).toContain("# ccr:start - local context continuity");
    expect(result).toContain(".ccr/journal/");
    expect(result).toContain(".ccr/private/");
  });

  it("should create the block when no .gitignore exists", () => {
    const result = localIgnoreContent(undefined);
    expect(result).toContain(".ccr/cache/");
    expect(result).toContain(".ccr/tmp/");
  });

  it("should not duplicate an existing block", () => {
    const once = localIgnoreContent(undefined);
    const twice = localIgnoreContent(once);
    expect(twice.split("# ccr:start - local context continuity").length - 1).toBe(1);
  });

  it("should atomically create local ignore rules when the repository has no .gitignore", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ccr-ignore-"));
    roots.push(root);

    await expect(ensureLocalIgnoreRules(root)).resolves.toBe("created");
    await expect(readFile(path.join(root, ".gitignore"), "utf8")).resolves.toContain(
      ".ccr/config.local.json",
    );
  });

  it("should preserve existing ignore content and report an unchanged managed block", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ccr-ignore-"));
    roots.push(root);
    const ignorePath = path.join(root, ".gitignore");
    const existing = localIgnoreContent("node_modules/\n");
    await writeFile(ignorePath, existing, "utf8");

    await expect(ensureLocalIgnoreRules(root)).resolves.toBe("unchanged");
    await expect(readFile(ignorePath, "utf8")).resolves.toBe(existing);
  });
});
