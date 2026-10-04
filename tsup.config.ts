import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Options, defineConfig } from "tsup";
import { renderReviewDimensionReference } from "./src/review/dimensions";

// Array configs build concurrently, so clean once before workers can race over the shared directory.
rmSync(fileURLToPath(new URL("./dist", import.meta.url)), { force: true, recursive: true });

const runtimeLocationOptions: Options["esbuildOptions"] = (options, { format }) => {
  // CommonJS uses __dirname; only ESM evaluates the import.meta branch of the live JSON loader.
  if (format === "cjs") options.define = { ...options.define, "import.meta.url": "undefined" };
};

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    noExternal: ["picomatch", "zod"],
    esbuildOptions: runtimeLocationOptions,
    clean: false,
    outDir: "dist",
    onSuccess: async () => {
      // Refresh the raw data on builds and watch rebuilds, independently of bundled imports.
      mkdirSync(fileURLToPath(new URL("./dist/review", import.meta.url)), { recursive: true });
      copyFileSync(
        fileURLToPath(new URL("./src/review/dimensions.json", import.meta.url)),
        fileURLToPath(new URL("./dist/review/dimensions.json", import.meta.url)),
      );
      writeFileSync(
        fileURLToPath(new URL("./dist/review/dimensions.md", import.meta.url)),
        renderReviewDimensionReference(
          JSON.parse(
            readFileSync(new URL("./src/review/dimensions.json", import.meta.url), "utf8"),
          ),
        ),
        "utf8",
      );
    },
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
    esbuildOptions: runtimeLocationOptions,
    sourcemap: false,
    clean: false,
    outDir: "dist/cli",
  },
]);
