import { test, expect } from "@playwright/test";

async function waitForApp(page: Parameters<typeof test>[1] extends (args: { page: infer P }) => unknown ? P : never) {
  await page.waitForFunction(() => {
    const html = document.documentElement;
    return html.style.visibility !== "hidden";
  }, { timeout: 10_000 });
}

test.describe("Calendar — Show Date Range (showday)", () => {
  test("Show Dates mode renders without errors", async ({ page }) => {
    await page.goto("/calendar");
    await waitForApp(page);

    // Switch to Show Dates mode
    await page.getByRole("button", { name: /show dates/i }).click();

    // Wait for loading spinner to disappear
    await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 10_000 });

    // Calendar grid should be visible
    await expect(page.locator("#root")).toBeVisible();
    await expect(page.locator("body")).toContainText(
      /(January|February|March|April|May|June|July|August|September|October|November|December)/
    );
  });

  test("Show Dates mode: intermediate show days appear between showStart and dismantleDate", async ({ page }) => {
    // Fetch shows from the API to find one with both showStart and dismantleDate
    const response = await page.request.get("/api/shows");
    expect(response.ok()).toBeTruthy();
    const shows = await response.json();

    const showWithRange = shows.find(
      (s: { showStart: string | null; dismantleDate: string | null }) =>
        s.showStart && s.dismantleDate && s.showStart < s.dismantleDate
    );

    if (!showWithRange) {
      test.skip(true, "No show with both showStart and dismantleDate — skipping range test");
      return;
    }

    // Parse the intermediate date (day after showStart)
    const start = new Date(showWithRange.showStart + "T00:00:00Z");
    start.setUTCDate(start.getUTCDate() + 1);
    const intermediateDateStr = start.toISOString().slice(0, 10);
    const [iYear, iMonth] = intermediateDateStr.split("-").map(Number);

    // Navigate to the calendar on the month containing the intermediate date
    await page.goto("/calendar");
    await waitForApp(page);

    // Navigate to the correct month
    const targetMonthYear = new Date(intermediateDateStr + "T00:00:00Z")
      .toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

    // Check current month shown on calendar
    const getCalendarMonth = () => page.locator(".text-lg.font-semibold").textContent();

    // Click next/prev until we reach the target month
    for (let attempts = 0; attempts < 24; attempts++) {
      const shown = await getCalendarMonth();
      if (shown && shown.trim() === targetMonthYear) break;
      // If target is in the future, click next; otherwise prev
      const shownDate = new Date("01 " + shown);
      const targetDate = new Date("01 " + targetMonthYear);
      if (targetDate > shownDate) {
        await page.getByRole("button", { name: "" }).nth(1).click(); // next chevron
      } else {
        await page.getByRole("button", { name: "" }).nth(0).click(); // prev chevron
      }
      await page.waitForTimeout(100);
    }

    // Switch to Show Dates mode
    await page.getByRole("button", { name: /show dates/i }).click();
    await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 10_000 });

    // Verify the API returns showday events for this show/month
    const calResponse = await page.request.get(
      `/api/calendar/show-dates?month=${iMonth}&year=${iYear}`
    );
    expect(calResponse.ok()).toBeTruthy();
    const calEvents = await calResponse.json();

    const showdayEvents = calEvents.filter(
      (e: { type: string; showId: number }) =>
        e.type === "showday" && e.showId === showWithRange.id
    );

    expect(showdayEvents.length).toBeGreaterThan(0);

    // Confirm the intermediate date is in the showday events
    const hasIntermediateDay = showdayEvents.some(
      (e: { date: string }) => e.date === intermediateDateStr
    );
    expect(hasIntermediateDay).toBeTruthy();
  });

  test("Show Dates API: showday events are only between showStart and dismantleDate", async ({ page }) => {
    const response = await page.request.get("/api/shows");
    const shows = await response.json();

    const showWithRange = shows.find(
      (s: { showStart: string | null; dismantleDate: string | null }) =>
        s.showStart && s.dismantleDate && s.showStart < s.dismantleDate
    );

    if (!showWithRange) {
      test.skip(true, "No show with both showStart and dismantleDate — skipping");
      return;
    }

    const startDate = new Date(showWithRange.showStart + "T00:00:00Z");
    const month = startDate.getUTCMonth() + 1;
    const year = startDate.getUTCFullYear();

    const calResponse = await page.request.get(
      `/api/calendar/show-dates?month=${month}&year=${year}`
    );
    const calEvents = await calResponse.json();

    const showdayEvents = calEvents.filter(
      (e: { type: string; showId: number }) =>
        e.type === "showday" && e.showId === showWithRange.id
    );

    // showStart and dismantleDate themselves should NOT be showday type
    const hasShowStartAsShowday = showdayEvents.some(
      (e: { date: string }) => e.date === showWithRange.showStart
    );
    const hasDismantleAsShowday = showdayEvents.some(
      (e: { date: string }) => e.date === showWithRange.dismantleDate
    );

    expect(hasShowStartAsShowday).toBeFalsy();
    expect(hasDismantleAsShowday).toBeFalsy();

    // All showday dates should be strictly between showStart and dismantleDate
    for (const e of showdayEvents) {
      expect(e.date > showWithRange.showStart).toBeTruthy();
      expect(e.date < showWithRange.dismantleDate).toBeTruthy();
    }
  });
});
