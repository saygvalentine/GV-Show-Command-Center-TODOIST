import { test, expect } from "@playwright/test";

async function waitForApp(page: Parameters<typeof test>[1] extends (args: { page: infer P }) => unknown ? P : never) {
  // next-themes temporarily sets visibility:hidden on <html> while detecting theme.
  // Wait for it to clear before asserting visibility.
  await page.waitForFunction(() => {
    const html = document.documentElement;
    return html.style.visibility !== "hidden";
  }, { timeout: 10_000 });
}

test.describe("Show Command Center — Smoke", () => {
  test("1. Dashboard renders", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/.+/);
    await waitForApp(page);
    await expect(page.locator("#root")).toBeVisible();
  });

  test("2. Calendar route renders", async ({ page }) => {
    await page.goto("/calendar");
    await waitForApp(page);
    await expect(page.locator("#root")).toBeVisible();
    await expect(page.locator("body")).toContainText(
      /(January|February|March|April|May|June|July|August|September|October|November|December|20\d\d)/,
    );
  });

  test("3. Office tasks route renders", async ({ page }) => {
    await page.goto("/office-tasks");
    await waitForApp(page);
    await expect(page.locator("#root")).toBeVisible();
  });

  test("4. Add Show button is visible on dashboard", async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);
    const addButton = page.getByRole("button", { name: /add.*show/i });
    await expect(addButton).toBeVisible();
  });

  test("5. Add Show dialog opens", async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);
    await page.getByRole("button", { name: /add.*show/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("6. At least one show exists, and clicking it navigates to detail", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForApp(page);
    const showLink = page.locator('a[href^="/shows/"]').first();
    const count = await showLink.count();
    test.skip(count === 0, "No shows exist yet — skipping detail test");
    await showLink.click();
    await expect(page).toHaveURL(/\/shows\/.+/);
    await waitForApp(page);
    await expect(page.locator("#root")).toBeVisible();
  });

  test("7. Tasks and E-Blasts tabs render on a show detail page", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForApp(page);
    const showLink = page.locator('a[href^="/shows/"]').first();
    const count = await showLink.count();
    test.skip(count === 0, "No shows exist yet — skipping tab test");
    await showLink.click();
    await expect(page.getByRole("tab", { name: /tasks/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /e-?blasts/i })).toBeVisible();
  });

  test("8. All visible links on dashboard have valid hrefs", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForApp(page);
    const links = page.locator("a[href]");
    const count = await links.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const href = await links.nth(i).getAttribute("href");
      expect(href, `Link ${i} has empty href`).toBeTruthy();
      expect(href, `Link ${i} has javascript: href`).not.toMatch(
        /^javascript:/,
      );
    }
  });
});
