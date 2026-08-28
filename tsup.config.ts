import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "tsup";

// Array configs build concurrently, so clean once before workers can race over the shared directory.
rmSync(fileURLToPath(new URL("./dist", import.meta.url)), { force: true, recursive: true });

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    noExternal: ["picomatch", "zod"],
    clean: false,
    outDir: "dist",
  },
  {
    entry: {
      "context/index": "src/context/index.ts",
      "llm/index": "src/llm/index.ts",
      "review/index": "src/review/index.ts",
    },
    format: "esm",
    dts: true,
    sourcemap: true,
    splitting: true,
    noExternal: ["picomatch", "zod"],
    clean: false,
    outDir: "dist",
  },
  {
    entry: { index: "src/cli/index.ts" },
    format: "cjs",
    platform: "node",
    target: "node22",
    noExternal: ["commander", "picomatch", "zod"],
    sourcemap: false,
    clean: false,
    outDir: "dist/cli",
  },
]);
