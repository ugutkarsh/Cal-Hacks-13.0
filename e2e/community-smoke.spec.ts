/**
 * Playwright smoke — map-first UI shell.
 * Mode: UI against local Next (or PLAYWRIGHT_BASE_URL). Not a live Auth/DM test.
 */

import { test, expect } from "@playwright/test";

test.describe("community UI smoke (no Auth)", () => {
  test("landing loads with Trailmap brand", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/Trailmap/i).first()).toBeVisible();
  });

  test("discover map shell exposes community + messages entry points", async ({
    page,
  }) => {
    await page.goto("/discover");
    await expect(
      page.getByRole("button", { name: /community posts/i }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("button", { name: /private messages/i }),
    ).toBeVisible();
  });

  test("community panel opens from nav", async ({ page }) => {
    await page.goto("/discover");
    await page.getByRole("button", { name: /community posts/i }).click();
    await expect(page.getByText(/community/i).first()).toBeVisible();
  });
});
