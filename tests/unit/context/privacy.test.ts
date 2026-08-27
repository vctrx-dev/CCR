import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTEXT_CONFIG, serializeContextConfig } from "../../../src/context/config";
import { filterExcludedPaths, readResolvedContextConfig } from "../../../src/context/privacy";
import { createTemporaryRootRegistry } from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();

async function makeConfigRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-privacy-config-"));
  roots.push(root);
  await mkdir(path.join(root, ".ccr"));
  await writeFile(
    path.join(root, ".ccr/config.json"),
    serializeContextConfig(DEFAULT_CONTEXT_CONFIG),
    "utf8",
  );
  return root;
}

describe("filterExcludedPaths", () => {
  it("should exclude sensitive paths before Claude receives a staged path list", () => {
    const result = filterExcludedPaths(
      [
        "src/main.py",
        ".CCR/JOURNAL/work.md",
        ".NPMRC",
        "keys/signing.PEM",
        "src/readme.md\n.env",
        ".env.local",
        "apps/api/.env.production",
        "config/secrets/key.json",
        "fixtures/student-data/records.csv",
      ],
      [],
    );

    expect(result.included).toEqual(["src/main.py", "fixtures/student-data/records.csv"]);
    expect(result.excluded).toHaveLength(7);
  });
});

describe("readResolvedContextConfig", () => {
  it("should reject oversized shared and local config before parsing", async () => {
    const root = await makeConfigRoot();
    await writeFile(path.join(root, ".ccr/config.json"), " ".repeat(64_001), "utf8");
    await expect(readResolvedContextConfig(root)).rejects.toThrow("exceeds 64000 characters");

    await writeFile(
      path.join(root, ".ccr/config.json"),
      serializeContextConfig(DEFAULT_CONTEXT_CONFIG),
      "utf8",
    );
    await writeFile(path.join(root, ".ccr/config.local.json"), " ".repeat(64_001), "utf8");
    await expect(readResolvedContextConfig(root)).rejects.toThrow("exceeds 64000 characters");
  });

  it("should reject malformed UTF-8 and NUL bytes in shared and local config", async () => {
    const root = await makeConfigRoot();
    await writeFile(path.join(root, ".ccr/config.json"), Buffer.from([255]));
    await expect(readResolvedContextConfig(root)).rejects.toThrow("valid UTF-8 text");

    await writeFile(
      path.join(root, ".ccr/config.json"),
      serializeContextConfig(DEFAULT_CONTEXT_CONFIG),
      "utf8",
    );
    await writeFile(path.join(root, ".ccr/config.local.json"), Buffer.from("{}\0", "utf8"));
    await expect(readResolvedContextConfig(root)).rejects.toThrow("valid UTF-8 text");
  });
});
