# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: calendar-showday.spec.ts >> Calendar — Show Date Range (showday) >> Show Dates mode: intermediate show days appear between showStart and dismantleDate
- Location: tests/calendar-showday.spec.ts:28:3

# Error details

```
Error: expect(received).toBeTruthy()

Received: false
```

# Test source

```ts
  1   | import { test, expect } from "@playwright/test";
  2   | 
  3   | async function waitForApp(page: Parameters<typeof test>[1] extends (args: { page: infer P }) => unknown ? P : never) {
  4   |   await page.waitForFunction(() => {
  5   |     const html = document.documentElement;
  6   |     return html.style.visibility !== "hidden";
  7   |   }, { timeout: 10_000 });
  8   | }
  9   | 
  10  | test.describe("Calendar — Show Date Range (showday)", () => {
  11  |   test("Show Dates mode renders without errors", async ({ page }) => {
  12  |     await page.goto("/calendar");
  13  |     await waitForApp(page);
  14  | 
  15  |     // Switch to Show Dates mode
  16  |     await page.getByRole("button", { name: /show dates/i }).click();
  17  | 
  18  |     // Wait for loading spinner to disappear
  19  |     await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 10_000 });
  20  | 
  21  |     // Calendar grid should be visible
  22  |     await expect(page.locator("#root")).toBeVisible();
  23  |     await expect(page.locator("body")).toContainText(
  24  |       /(January|February|March|April|May|June|July|August|September|October|November|December)/
  25  |     );
  26  |   });
  27  | 
  28  |   test("Show Dates mode: intermediate show days appear between showStart and dismantleDate", async ({ page }) => {
  29  |     // Fetch shows from the API to find one with both showStart and dismantleDate
  30  |     const response = await page.request.get("/api/shows");
> 31  |     expect(response.ok()).toBeTruthy();
      |                           ^ Error: expect(received).toBeTruthy()
  32  |     const shows = await response.json();
  33  | 
  34  |     const showWithRange = shows.find(
  35  |       (s: { showStart: string | null; dismantleDate: string | null }) =>
  36  |         s.showStart && s.dismantleDate && s.showStart < s.dismantleDate
  37  |     );
  38  | 
  39  |     if (!showWithRange) {
  40  |       test.skip(true, "No show with both showStart and dismantleDate — skipping range test");
  41  |       return;
  42  |     }
  43  | 
  44  |     // Parse the intermediate date (day after showStart)
  45  |     const start = new Date(showWithRange.showStart + "T00:00:00Z");
  46  |     start.setUTCDate(start.getUTCDate() + 1);
  47  |     const intermediateDateStr = start.toISOString().slice(0, 10);
  48  |     const [iYear, iMonth] = intermediateDateStr.split("-").map(Number);
  49  | 
  50  |     // Navigate to the calendar on the month containing the intermediate date
  51  |     await page.goto("/calendar");
  52  |     await waitForApp(page);
  53  | 
  54  |     // Navigate to the correct month
  55  |     const targetMonthYear = new Date(intermediateDateStr + "T00:00:00Z")
  56  |       .toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  57  | 
  58  |     // Check current month shown on calendar
  59  |     const getCalendarMonth = () => page.locator(".text-lg.font-semibold").textContent();
  60  | 
  61  |     // Click next/prev until we reach the target month
  62  |     for (let attempts = 0; attempts < 24; attempts++) {
  63  |       const shown = await getCalendarMonth();
  64  |       if (shown && shown.trim() === targetMonthYear) break;
  65  |       // If target is in the future, click next; otherwise prev
  66  |       const shownDate = new Date("01 " + shown);
  67  |       const targetDate = new Date("01 " + targetMonthYear);
  68  |       if (targetDate > shownDate) {
  69  |         await page.getByRole("button", { name: "" }).nth(1).click(); // next chevron
  70  |       } else {
  71  |         await page.getByRole("button", { name: "" }).nth(0).click(); // prev chevron
  72  |       }
  73  |       await page.waitForTimeout(100);
  74  |     }
  75  | 
  76  |     // Switch to Show Dates mode
  77  |     await page.getByRole("button", { name: /show dates/i }).click();
  78  |     await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 10_000 });
  79  | 
  80  |     // Verify the API returns showday events for this show/month
  81  |     const calResponse = await page.request.get(
  82  |       `/api/calendar/show-dates?month=${iMonth}&year=${iYear}`
  83  |     );
  84  |     expect(calResponse.ok()).toBeTruthy();
  85  |     const calEvents = await calResponse.json();
  86  | 
  87  |     const showdayEvents = calEvents.filter(
  88  |       (e: { type: string; showId: number }) =>
  89  |         e.type === "showday" && e.showId === showWithRange.id
  90  |     );
  91  | 
  92  |     expect(showdayEvents.length).toBeGreaterThan(0);
  93  | 
  94  |     // Confirm the intermediate date is in the showday events
  95  |     const hasIntermediateDay = showdayEvents.some(
  96  |       (e: { date: string }) => e.date === intermediateDateStr
  97  |     );
  98  |     expect(hasIntermediateDay).toBeTruthy();
  99  |   });
  100 | 
  101 |   test("Show Dates API: showday events are only between showStart and dismantleDate", async ({ page }) => {
  102 |     const response = await page.request.get("/api/shows");
  103 |     const shows = await response.json();
  104 | 
  105 |     const showWithRange = shows.find(
  106 |       (s: { showStart: string | null; dismantleDate: string | null }) =>
  107 |         s.showStart && s.dismantleDate && s.showStart < s.dismantleDate
  108 |     );
  109 | 
  110 |     if (!showWithRange) {
  111 |       test.skip(true, "No show with both showStart and dismantleDate — skipping");
  112 |       return;
  113 |     }
  114 | 
  115 |     const startDate = new Date(showWithRange.showStart + "T00:00:00Z");
  116 |     const month = startDate.getUTCMonth() + 1;
  117 |     const year = startDate.getUTCFullYear();
  118 | 
  119 |     const calResponse = await page.request.get(
  120 |       `/api/calendar/show-dates?month=${month}&year=${year}`
  121 |     );
  122 |     const calEvents = await calResponse.json();
  123 | 
  124 |     const showdayEvents = calEvents.filter(
  125 |       (e: { type: string; showId: number }) =>
  126 |         e.type === "showday" && e.showId === showWithRange.id
  127 |     );
  128 | 
  129 |     // showStart and dismantleDate themselves should NOT be showday type
  130 |     const hasShowStartAsShowday = showdayEvents.some(
  131 |       (e: { date: string }) => e.date === showWithRange.showStart
```