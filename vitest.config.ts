import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "packages/*/src/**/*.test.ts",
      "packages/core/schema/**/*.test.ts",
      "packages/core/critic/**/*.test.ts",
      "packages/core/plan/**/*.test.ts",
      "apps/*/src/**/*.test.ts",
      "packages/*/test/contract/**/*.test.ts",
      "packages/agents/*/src/**/*.test.ts",
      "packages/agents/*/test/contract/**/*.test.ts",
    ],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**"],
    testTimeout: 5000,
    // Ph0's empty tree has no suites yet — `pnpm verify` must still be green (15 §11).
    passWithNoTests: true,
  },
});
