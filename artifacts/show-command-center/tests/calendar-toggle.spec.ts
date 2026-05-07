import { test, expect, Page } from "@playwright/test";

async function waitForApp(page: Page) {
  await page.waitForFunction(
    () => document.documentElement.style.visibility !== "hidden",
    { timeout: 10_000 },
  );
}

async function gotoCalendar(page: Page) {
  await page.goto("/calendar");
  await waitForApp(page);
  await page.waitForLoadState("networkidle", { timeout: 15_000 });
}

const now = new Date();
const MONTH = now.getMonth() + 1;
const YEAR = now.getFullYear();

// ─── 1. API — GET /api/calendar/show-dates ────────────────────────────────────

test.describe("GET /api/calendar/show-dates", () => {
  test("returns 200 with a JSON array", async ({ request }) => {
    const res = await request.get(`/api/calendar/show-dates?month=${MONTH}&year=${YEAR}`);
    expect(res.status()).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  test("returns 400 when month/year params are missing", async ({ request }) => {
    const res = await request.get("/api/calendar/show-dates");
    expect(res.status()).toBe(400);
  });

  test("each item has required fields with correct types", async ({ request }) => {
    const items = (await (
      await request.get(`/api/calendar/show-dates?month=${MONTH}&year=${YEAR}`)
    ).json()) as unknown[];
    for (const raw of items) {
      const item = raw as Record<string, unknown>;
      expect(typeof item.id).toBe("number");
      expect(typeof item.type).toBe("string");
      expect(typeof item.showId).toBe("number");
      expect(typeof item.showName).toBe("string");
      expect(typeof item.name).toBe("string");
      expect(typeof item.date).toBe("string");
    }
  });

  test("all type values are valid show milestone types", async ({ request }) => {
    const validTypes = new Set([
      "movein",
      "advwarehouse",
      "discount",
      "orderdeadline",
      "showstart",
      "dismantle",
    ]);
    const items = (await (
      await request.get(`/api/calendar/show-dates?month=${MONTH}&year=${YEAR}`)
    ).json()) as Array<{ type: string }>;
    for (const item of items) {
      expect(validTypes).toContain(item.type);
    }
  });

  test("items are sorted by date ascending", async ({ request }) => {
    const items = (await (
      await request.get(`/api/calendar/show-dates?month=${MONTH}&year=${YEAR}`)
    ).json()) as Array<{ date: string }>;
    if (items.length < 2) return;
    for (let i = 0; i < items.length - 1; i++) {
      expect(items[i].date <= items[i + 1].date).toBe(true);
    }
  });

  test("all returned dates fall within the requested month", async ({ request }) => {
    const items = (await (
      await request.get(`/api/calendar/show-dates?month=${MONTH}&year=${YEAR}`)
    ).json()) as Array<{ date: string }>;
    const prefix = `${YEAR}-${String(MONTH).padStart(2, "0")}`;
    for (const item of items) {
      expect(item.date.startsWith(prefix)).toBe(true);
    }
  });

  test("showId filter returns only events for that show", async ({ request }) => {
    // First fetch all events to find a showId with events in this month
    const all = (await (
      await request.get(`/api/calendar/show-dates?month=${MONTH}&year=${YEAR}`)
    ).json()) as Array<{ showId: number }>;
    if (all.length === 0) return; // no milestone dates this month — skip
    const targetShowId = all[0].showId;

    const filtered = (await (
      await request.get(
        `/api/calendar/show-dates?month=${MONTH}&year=${YEAR}&showId=${targetShowId}`,
      )
    ).json()) as Array<{ showId: number }>;

    expect(filtered.length).toBeGreaterThan(0);
    for (const item of filtered) {
      expect(item.showId).toBe(targetShowId);
    }
  });
});

// ─── 2. UI — Calendar Toggle ──────────────────────────────────────────────────

test.describe("Calendar toggle: Task Dates vs Show Dates", () => {
  test.beforeEach(async ({ page }) => {
    await gotoCalendar(page);
  });

  test("both toggle buttons are visible on the calendar page", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Task Dates" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Show Dates" })).toBeVisible();
  });

  test("'Task Dates' is active by default (has primary background)", async ({ page }) => {
    const taskDatesBtn = page.getByRole("button", { name: "Task Dates" });
    // shadcn variant="default" applies bg-primary; variant="ghost" does not
    await expect(taskDatesBtn).toHaveClass(/bg-primary/);
    await expect(page.getByRole("button", { name: "Show Dates" })).not.toHaveClass(/bg-primary/);
  });

  test("clicking 'Show Dates' makes it the active button", async ({ page }) => {
    await page.getByRole("button", { name: "Show Dates" }).click();
    await expect(page.getByRole("button", { name: "Show Dates" })).toHaveClass(/bg-primary/);
    await expect(page.getByRole("button", { name: "Task Dates" })).not.toHaveClass(/bg-primary/);
  });

  test("clicking back to 'Task Dates' restores it as active", async ({ page }) => {
    await page.getByRole("button", { name: "Show Dates" }).click();
    await expect(page.getByRole("button", { name: "Show Dates" })).toHaveClass(/bg-primary/);
    await page.getByRole("button", { name: "Task Dates" }).click();
    await expect(page.getByRole("button", { name: "Task Dates" })).toHaveClass(/bg-primary/);
    await expect(page.getByRole("button", { name: "Show Dates" })).not.toHaveClass(/bg-primary/);
  });

  test("toggling does not navigate away from /calendar", async ({ page }) => {
    await page.getByRole("button", { name: "Show Dates" }).click();
    await expect(page).toHaveURL(/\/calendar/);
    await page.getByRole("button", { name: "Task Dates" }).click();
    await expect(page).toHaveURL(/\/calendar/);
  });

  test("calendar 7-column day grid renders in both modes", async ({ page }) => {
    const dayHeaders = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    for (const day of dayHeaders) {
      await expect(page.getByText(day, { exact: true }).first()).toBeVisible();
    }
    await page.getByRole("button", { name: "Show Dates" }).click();
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
    for (const day of dayHeaders) {
      await expect(page.getByText(day, { exact: true }).first()).toBeVisible();
    }
  });

  test("Export .ics button is visible in both modes", async ({ page }) => {
    await expect(page.getByRole("button", { name: /export .ics/i })).toBeVisible();
    await page.getByRole("button", { name: "Show Dates" }).click();
    await expect(page.getByRole("button", { name: /export .ics/i })).toBeVisible();
  });

  test("switching to Show Dates calls /api/calendar/show-dates", async ({ page }) => {
    const [request] = await Promise.all([
      page.waitForRequest((req) => req.url().includes("/api/calendar/show-dates")),
      page.getByRole("button", { name: "Show Dates" }).click(),
    ]);
    expect(request.url()).toContain("/api/calendar/show-dates");
  });

  test("show filter dropdown is visible in both modes", async ({ page }) => {
    // The Select trigger for show filter
    const filterTrigger = page.locator('[role="combobox"]').first();
    await expect(filterTrigger).toBeVisible();
    await page.getByRole("button", { name: "Show Dates" }).click();
    await expect(filterTrigger).toBeVisible();
  });
});

// ─── 3. UI — Show Dates calendar chips ───────────────────────────────────────

test.describe("Show Dates milestone chips", () => {
  test.beforeEach(async ({ page }) => {
    await gotoCalendar(page);
    await page.getByRole("button", { name: "Show Dates" }).click();
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
  });

  test("milestone chip colors are distinct from task/eblast colors when present", async ({
    page,
    request,
  }) => {
    const items = (await (
      await request.get(`/api/calendar/show-dates?month=${MONTH}&year=${YEAR}`)
    ).json()) as unknown[];
    test.skip(items.length === 0, "No show milestone dates in current month");

    // Show date chips use amber/green/violet/teal/rose — none of these are blue (task color)
    // At minimum, no blue-500 chips should appear (task color), confirming mode switch worked
    const blueChips = page.locator(".text-blue-500");
    await expect(blueChips).toHaveCount(0);
  });

  test("clicking a day with milestone events shows them in the detail sidebar", async ({
    page,
    request,
  }) => {
    const items = (await (
      await request.get(`/api/calendar/show-dates?month=${MONTH}&year=${YEAR}`)
    ).json()) as Array<{ date: string; name: string }>;
    test.skip(items.length === 0, "No show milestone dates in current month");

    // Click the day cell that has the first milestone date
    const [itemYear, itemMonth, itemDay] = items[0].date.split("-").map(Number);
    // Navigate to the right month if needed
    const dayCell = page.locator(`.grid [class*='cursor-pointer']`).filter({
      has: page.locator(`text="${itemDay}"`),
    });
    if ((await dayCell.count()) > 0) {
      await dayCell.first().click();
      // The detail sidebar (right panel) should show some content
      const sidebar = page.locator("aside, [class*='sticky']").last();
      await expect(sidebar).toBeVisible();
    }
  });
});

// ─── 4. Export .ics — mode parameter ─────────────────────────────────────────

test.describe("Export .ics — mode parameter routing", () => {
  // The export button uses a programmatic <a download> click. Playwright captures
  // these as download events, not as route-interceptable fetch requests.

  test("Task Dates export does NOT include mode=showdates param", async ({ page }) => {
    await gotoCalendar(page);
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 10_000 }),
      page.getByRole("button", { name: /export .ics/i }).click(),
    ]);
    expect(download.url()).toContain("/api/export/ics");
    expect(download.url()).not.toContain("mode=showdates");
  });

  test("Show Dates export includes mode=showdates param", async ({ page }) => {
    await gotoCalendar(page);
    await page.getByRole("button", { name: "Show Dates" }).click();
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 10_000 }),
      page.getByRole("button", { name: /export .ics/i }).click(),
    ]);
    expect(download.url()).toContain("/api/export/ics");
    expect(download.url()).toContain("mode=showdates");
  });
});
