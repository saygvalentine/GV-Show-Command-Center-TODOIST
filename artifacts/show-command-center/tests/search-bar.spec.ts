import { test, expect, Page } from "@playwright/test";

async function waitForApp(page: Page) {
  await page.waitForFunction(
    () => document.documentElement.style.visibility !== "hidden",
    { timeout: 10_000 },
  );
}

// One show is created before the suite and reused across tests that need a real match.
let testShowName: string;

test.describe("Search bar", () => {
  test.beforeAll(async ({ browser }) => {
    testShowName = `SearchBarTest_${Date.now()}`;
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await page.goto("/");
      await page.waitForFunction(
        () => document.documentElement.style.visibility !== "hidden",
        { timeout: 10_000 },
      );
      await page.getByRole("button", { name: /add.*show/i }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel(/name/i).fill(testShowName);
      await dialog.getByLabel(/move.?in/i).fill("2027-06-15");
      await dialog.getByRole("button", { name: /add show|create|submit/i }).click();
      await page.waitForURL(/\/shows\/\d+/, { timeout: 10_000 });
    } finally {
      await ctx.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);
  });

  // ─── Input UI ───────────────────────────────────────────────────────────────

  test("search input is visible in the navbar", async ({ page }) => {
    await expect(page.getByPlaceholder("Search shows...")).toBeVisible();
  });

  test("× button appears only when the input has text and is gone after clearing", async ({
    page,
  }) => {
    const input = page.getByPlaceholder("Search shows...");
    const clearBtn = page.getByRole("button", { name: /clear search/i });

    await expect(clearBtn).not.toBeVisible();
    await input.fill("test");
    await expect(clearBtn).toBeVisible();
    await clearBtn.click();
    await expect(clearBtn).not.toBeVisible();
    await expect(input).toHaveValue("");
  });

  // ─── URL sync ───────────────────────────────────────────────────────────────

  test("typing on the dashboard updates the URL to /?q=<term>", async ({ page }) => {
    await page.getByPlaceholder("Search shows...").fill("IMEX");
    await expect(page).toHaveURL(/\?q=IMEX/);
  });

  test("direct navigation to /?q=<term> populates the search input", async ({ page }) => {
    await page.goto("/?q=IMEX");
    await waitForApp(page);
    await expect(page.getByPlaceholder("Search shows...")).toHaveValue("IMEX");
  });

  // ─── Filtering ──────────────────────────────────────────────────────────────

  test("show with matching name stays visible after searching", async ({ page }) => {
    await page.getByPlaceholder("Search shows...").fill(testShowName);
    await expect(page.getByText(testShowName).first()).toBeVisible();
  });

  test("show is hidden when search query does not match its name", async ({ page }) => {
    await page.getByPlaceholder("Search shows...").fill(testShowName);
    await expect(page.getByText(testShowName).first()).toBeVisible();
    // Now search for something that can't match our show
    await page.getByPlaceholder("Search shows...").fill("ZZZNOTASHOW999");
    await expect(page.getByText(testShowName)).not.toBeVisible();
  });

  test("empty state shows informative message when no shows match the query", async ({
    page,
  }) => {
    await page.getByPlaceholder("Search shows...").fill("ZZZNOTASHOW999");
    await expect(page.getByText(/no shows match/i)).toBeVisible();
  });

  // ─── Clearing ───────────────────────────────────────────────────────────────

  test("× button clears search, resets URL to /, and restores the full list", async ({
    page,
  }) => {
    const input = page.getByPlaceholder("Search shows...");
    await input.fill("ZZZNOTASHOW999");
    await expect(page.getByText(/no shows match/i)).toBeVisible();

    await page.getByRole("button", { name: /clear search/i }).click();

    await expect(page).toHaveURL("/");
    await expect(input).toHaveValue("");
    await expect(page.getByText(/no shows match/i)).not.toBeVisible();
    // The show we created should be back
    await expect(page.getByText(testShowName).first()).toBeVisible();
  });

  test("Escape key clears the search input and navigates back to /", async ({ page }) => {
    const input = page.getByPlaceholder("Search shows...");
    await input.fill("IMEX");
    await expect(page).toHaveURL(/\?q=/);

    await input.press("Escape");

    await expect(page).toHaveURL("/");
    await expect(input).toHaveValue("");
  });

  // ─── Cross-page navigation ──────────────────────────────────────────────────

  test("Enter key on a non-dashboard page navigates to /?q=<term>", async ({ page }) => {
    await page.goto("/calendar");
    await waitForApp(page);

    const input = page.getByPlaceholder("Search shows...");
    await input.fill("IMEX");
    await input.press("Enter");

    await expect(page).toHaveURL(/\?q=IMEX/);
    // Should now be on the dashboard
    await waitForApp(page);
    await expect(page.getByText(/active shows/i)).toBeVisible();
  });

  test("Enter key on dashboard with empty input navigates to /", async ({ page }) => {
    // Start with a query in the URL
    await page.goto("/?q=IMEX");
    await waitForApp(page);
    const input = page.getByPlaceholder("Search shows...");
    await input.clear();
    await input.press("Enter");
    await expect(page).toHaveURL("/");
  });
});
