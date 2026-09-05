import { expect, test } from "@playwright/test";

/**
 * UI smoke for the Ph6 report screen against a live API + Next app.
 * Start servers first, or rely on webServer in playwright config.
 */
test.describe("FORGE report UI", () => {
  test("home links to the demo report", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "FORGE" })).toBeVisible();
    await page.getByRole("link", { name: /Open demo report/i }).click();
    await expect(page).toHaveURL(/\/s\/ses_demo\/report$/);
  });

  test("report shows five mandated sections, score, heal + V2 refuse", async ({ page }) => {
    await page.goto("/s/ses_demo/report");

    await expect(page.getByTestId("score-current")).toBeVisible();
    const scoreText = await page.getByTestId("score-current").innerText();
    expect(Number(scoreText)).toBeGreaterThan(0);

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
  });
});
