import { test, expect } from "@playwright/test";

test.describe("Aperture Shop", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:3000");
  });

  test("loads home page", async ({ page }) => {
    await expect(page.locator("h1")).toContainText("Aperture");
  });

  test("navigates to products page", async ({ page }) => {
    await page.click('a[href="/products"]');
    await expect(page.locator("h2")).toContainText("Products");
    await expect(page.locator(".product")).toHaveCount(4);
  });

  test("adds product to cart", async ({ page }) => {
    await page.goto("http://localhost:3000/products");
    await page.click('form[action="/cart/add"] button:has-text("Add to Cart")', { force: true });
    await expect(page.locator(".cart-count")).toContainText("1");
  });

  test("views cart", async ({ page }) => {
    await page.goto("http://localhost:3000/products");
    await page.click('form[action="/cart/add"] button:has-text("Add to Cart")', { force: true });
    await page.goto("http://localhost:3000/cart");
    await expect(page.locator("h2")).toContainText("Shopping Cart");
  });

  test("login flow", async ({ page }) => {
    await page.goto("http://localhost:3000/login");
    await page.fill('input[name="email"]', "user@example.com");
    await page.fill('input[name="password"]', "password123");
    await page.click('button[type="submit"]');
    await expect(page.locator("nav")).toContainText("Logout");
  });

  test("checkout requires authentication", async ({ page }) => {
    await page.goto("http://localhost:3000/products");
    await page.click('form[action="/cart/add"] button:has-text("Add to Cart")', { force: true });
    await page.goto("http://localhost:3000/checkout");
    await expect(page.url()).toContain("/login");
  });

  test("full checkout flow", async ({ page }) => {
    await page.goto("http://localhost:3000/login");
    await page.fill('input[name="email"]', "user@example.com");
    await page.fill('input[name="password"]', "password123");
    await page.click('button[type="submit"]');

    await page.goto("http://localhost:3000/products");
    await page.click('form[action="/cart/add"] button:has-text("Add to Cart")', { force: true });
    await page.goto("http://localhost:3000/checkout");

    await page.fill('input[name="fullName"]', "Test User");
    await page.fill('input[name="address"]', "123 Test St");
    await page.fill('input[name="city"]', "Test City");
    await page.fill('input[name="zip"]', "12345");
    await page.fill('input[name="cardNumber"]', "4242 4242 4242 4242");
    await page.fill('input[name="expiry"]', "12/25");
    await page.fill('input[name="cvv"]', "123");
    await page.click('button[type="submit"]');

    await expect(page.locator("h2")).toContainText("Order Confirmed");
  });
});