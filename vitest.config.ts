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
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      // Release coverage measures shipped source, not repository tooling exercised by separate checks.
      include: ["src/**/*.ts"],
      thresholds: {
        "src/**/*.ts": {
          statements: 90,
          branches: 80,
          functions: 93,
          lines: 90,
        },
      },
    },
  },
});
