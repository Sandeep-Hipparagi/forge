import { expect, test } from "@playwright/test";

/**
 * UI smoke for Start → Session pipeline → Report against a live API + Next app.
 */
test.describe("FORGE report UI", () => {
  test("home accepts a URL and shows the report pipeline step by step", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "FORGE" })).toBeVisible();

    const urlField = page.getByLabel("Application URL");
    await urlField.fill("https://shop.test/");
    await page.getByRole("button", { name: /Start/i }).click();

    await expect(page).toHaveURL(/\/s\/ses_/);
    await expect(page.getByTestId("pipeline")).toBeVisible();

    await expect(page.getByTestId("step-start")).toBeVisible();
    await expect(page.getByTestId("step-explore")).toBeVisible();
    await expect(page.getByTestId("step-plan")).toBeVisible();
    await expect(page.getByTestId("step-report")).toBeVisible();
    await expect(page.getByTestId("step-finish")).toBeVisible();

    await expect(page.getByTestId("pipeline-complete")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("session-status")).toContainText(/Completed/i);

    await page.getByTestId("open-report").click();
    await expect(page).toHaveURL(/\/report$/);
    await expect(page.getByTestId("score-current")).toBeVisible();
  });

  test("home still links to the demo report", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /demo report/i }).click();
    await expect(page).toHaveURL(/\/s\/ses_demo\/report$/);
  });

  test("report shows five mandated sections, score, heal + V2 refuse", async ({ page }) => {
    await page.goto("/s/ses_demo/report");

    await expect(page.getByTestId("score-current")).toBeVisible();
    const scoreText = await page.getByTestId("score-current").innerText();
    expect(Number(scoreText)).toBeGreaterThan(0);

    // New capability breakdown section for demo storytelling.
    await expect(page.getByRole("heading", { name: /Capability robustness/i })).toBeVisible();

    await expect(page.getByRole("heading", { name: /Test scenarios covered/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Pass \/ fail outcomes/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Self-healing actions/i })).toBeVisible();
    await expect(page.getByTestId("residual-gaps")).toContainText("coupon redemption");
    await expect(page.getByTestId("accepted-risk")).toContainText("payment gateway timeout");
    await expect(page.getByRole("heading", { name: /Untested flow risk/i })).toBeVisible();

    const healer = page.getByTestId("healer-actions");
    await expect(healer).toContainText("HEALED");
    await expect(healer).toContainText("BLOCKED");
    await expect(healer).toContainText("V2");

    // Healer summary surfaces heal vs refuse story in one line.
    const summary = page.getByTestId("healer-summary");
    await expect(summary).toBeVisible();
    await expect(summary).toContainText(/healed/i);
    await expect(summary).toContainText(/blocked/i);

    // Veto glossary explains the guardrails V1–V5.
    await expect(
      page.getByRole("heading", { name: /Decision guardrails · vetoes V1–V5/i }),
    ).toBeVisible();
    await expect(page.getByText(/Destructive-verb veto/i)).toBeVisible();
  });
});
