import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 15000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/bin.ts", "src/types.ts"],
      reporter: ["text", "lcov", "json-summary"],
      thresholds: { lines: 95, functions: 95, statements: 95, branches: 90 },
    },
  },
});
