import type { CompiledSuite, EmitMeta, EmittedProject } from "./types.js";

/**
 * Pass 5 — portable project layout ([12 §6](docs/03-algorithms/12-generator.md)).
 * Pure: returns file contents; callers write via `store.safeWrite` (`FR-407`, `I-9`).
 * Timestamps live only in `forge.manifest.json` (excluded from `.spec.ts` byte-identity).
 */
export function emitProject(suite: CompiledSuite, meta: EmitMeta): EmittedProject {
  const files = [
    {
      relativePath: "package.json",
      content:
        JSON.stringify(
          {
            name: "forge-generated-suite",
            private: true,
            version: "1.0.0",
            scripts: { test: "playwright test" },
            devDependencies: { "@playwright/test": "1.49.1" },
          },
          null,
          2,
        ) + "\n",
    },
    {
      relativePath: "playwright.config.ts",
      content: [
        'import { defineConfig, devices } from "@playwright/test";',
        "",
        "export default defineConfig({",
        '  testDir: "./tests",',
        "  fullyParallel: false,",
        "  forbidOnly: !!process.env.CI,",
        "  retries: 0,",
        "  workers: 1,",
        "  use: {",
        '    ...devices["Desktop Chrome"],',
        "    viewport: { width: 1440, height: 900 },",
        '    trace: "on-first-retry",',
        '    launchOptions: { args: ["--force-prefers-reduced-motion"] },',
        "  },",
        '  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],',
        "});",
        "",
      ].join("\n"),
    },
    {
      relativePath: "README.md",
      content: [
        "# FORGE-generated suite",
        "",
        "Portable Playwright project. No FORGE dependency.",
        "",
        "```bash",
        "npm i && npx playwright test",
        "```",
        "",
        `Session: ${meta.sessionId}`,
        `Plan: ${meta.planId}`,
        "",
      ].join("\n"),
    },
    {
      relativePath: "forge.manifest.json",
      content:
        JSON.stringify(
          {
            sessionId: meta.sessionId,
            planId: meta.planId,
            modelId: meta.modelId,
            browserRevision: meta.browserRevision,
            capabilityName: suite.capabilityName,
            assessmentScore: suite.assessmentScore,
            createdAt: meta.createdAt,
            specs: suite.specs.map((s) => s.relativePath),
          },
          null,
          2,
        ) + "\n",
    },
    {
      relativePath: ".gitignore",
      content: [".auth/", "test-results/", "playwright-report/", "node_modules/", ""].join("\n"),
    },
    {
      relativePath: "tests/auth.setup.ts",
      content: [
        'import { test as setup } from "@playwright/test";',
        "",
        'setup("authenticate", async ({ page }) => {',
        "  const user = process.env.FORGE_USERNAME;",
        "  const pass = process.env.FORGE_PASSWORD;",
        "  if (!user || !pass) return;",
        '  await page.goto("/login");',
        '  await page.getByLabel("Email").fill(user);',
        '  await page.getByLabel("Password").fill(pass);',
        '  await page.getByRole("button", { name: "Sign in" }).click();',
        '  await page.context().storageState({ path: ".auth/state.json" });',
        "});",
        "",
      ].join("\n"),
    },
    {
      relativePath: "tests/fixtures/forge.ts",
      content: [
        "// Shared helpers for the generated suite. No network, no cleverness.",
        "export const FORGE_FIXTURE = true;",
        "",
      ].join("\n"),
    },
    ...suite.specs,
  ];

  return { files };
}
