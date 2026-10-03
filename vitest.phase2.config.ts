import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: [
      "packages/perception/tests/**/*.test.ts",
      "packages/agents/tests/**/*.test.ts",
    ],
    environment: "node",
    globals: true,
  },
});
