import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@forge/core": fileURLToPath(
        new URL("./packages/core/src/index.ts", import.meta.url),
      ),
      "@forge/critic": fileURLToPath(
        new URL("./packages/critic/src/index.ts", import.meta.url),
      ),
      "@forge/planner": fileURLToPath(
        new URL("./packages/planner/src/index.ts", import.meta.url),
      ),
      "@forge/compile": fileURLToPath(
        new URL("./packages/compile/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: [
      "packages/critic/tests/**/*.test.ts",
      "packages/planner/tests/**/*.test.ts",
      "packages/compile/tests/**/*.test.ts",
    ],
    environment: "node",
    globals: true,
  },
});
