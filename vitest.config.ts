import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Git-heavy temporary repositories contend badly under Windows process-level parallelism.
    maxWorkers: process.platform === "win32" ? 1 : undefined,
    // Windows process startup and filesystem scanning can exceed Vitest's 5-second default.
    testTimeout: process.platform === "win32" ? 30_000 : 5_000,
    passWithNoTests: false,
    coverage: {
      provider: "v8",
      // Optional diagnostic only; meaningful behavioral checks define the release gate.
      include: ["src/**/*.ts"],
    },
  },
});
