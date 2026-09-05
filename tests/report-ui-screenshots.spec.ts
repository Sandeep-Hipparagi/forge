import { expect, test } from "@playwright/test";

/**
 * Visual walkthrough of the Start → Session pipeline → Report using screenshots.
 * This spec is safe to run locally and in CI; screenshots are written to tests/screenshots/.
 */
test.describe("FORGE report UI screenshots", () => {
  test("captures the start → session → report pipeline", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "FORGE" })).toBeVisible();

    const capture = async (name: string) => {
      await page.screenshot({
        path: `tests/screenshots/${name}.png`,
        fullPage: true,
      });
    };

    await capture("01-home-start");

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

    await capture("02-session-pipeline");

    await expect(page.getByTestId("pipeline-complete")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("session-status")).toContainText(/Completed/i);

    await capture("03-session-complete");

    await page.getByTestId("open-report").click();
    await expect(page).toHaveURL(/\/report$/);
    await expect(page.getByTestId("score-current")).toBeVisible();

    await capture("04-report");
  });
});
