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
    target: "node24",
    sourcemap: true,
    clean: false,
    outDir: "dist/cli",
  },
  {
    entry: { index: "src/action/index.ts" },
    format: "cjs",
    platform: "node",
    target: "node24",
    sourcemap: true,
    clean: false,
    outDir: "dist/action",
  },
]);
