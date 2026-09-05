import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@forge/core": fileURLToPath(
        new URL("./packages/core/src/index.ts", import.meta.url),
      ),
      "@forge/store": fileURLToPath(
        new URL("./packages/store/src/index.ts", import.meta.url),
      ),
      "@forge/orchestrator": fileURLToPath(
        new URL("./packages/orchestrator/src/index.ts", import.meta.url),
      ),
      "@forge/api": fileURLToPath(
        new URL("./packages/api/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: ["packages/*/tests/**/*.test.ts"],
    environment: "node",
    globals: true,
    reporters: ["default"],
  },
});
