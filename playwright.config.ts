import { defineConfig } from "@playwright/test";

export default defineConfig({
  use: { viewport: { width: 1440, height: 900 }, trace: "retain-on-failure" },
  timeout: 30_000,
});
