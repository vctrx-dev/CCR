import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: "esm",
    dts: true,
    sourcemap: true,
    clean: true,
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
