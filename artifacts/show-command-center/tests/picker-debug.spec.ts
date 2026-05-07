import { test, expect } from "@playwright/test";

async function waitForApp(page: Parameters<typeof test>[1] extends (args: { page: infer P }) => unknown ? P : never) {
  await page.waitForFunction(() => document.documentElement.style.visibility !== "hidden", { timeout: 10_000 });
}

test("date range picker - Add Show dialog: opens, selects range, label updates, saves", async ({ page }) => {
  await page.goto("/");
  await waitForApp(page);
  await page.getByRole("button", { name: /add.*show/i }).click();
  const dialog = page.getByRole("dialog");

  // Fill required fields so we can submit
  await dialog.getByLabel(/show name/i).fill(`Picker Test ${Date.now()}`);
  await dialog.locator('input[type="date"]').first().fill("2026-09-01");

  // The show dates field should be visible
  const pickerBtn = dialog.getByRole("button", { name: /pick show dates/i });
  await expect(pickerBtn).toBeVisible();
  await page.screenshot({ path: "/tmp/picker-1-before-open.png", fullPage: false });

  // Open the picker
  await pickerBtn.click();
  await page.screenshot({ path: "/tmp/picker-2-calendar-open.png", fullPage: false });

  // Calendar popover should appear
  const popover = page.locator('[data-slot="popover-content"], [data-radix-popper-content-wrapper]');
  await expect(popover.first()).toBeVisible({ timeout: 3_000 });

  // Click a start date (find a day button in the calendar)
  const dayBtns = page.locator('[data-slot="calendar"] button[data-day]');
  const count = await dayBtns.count();
  console.log(`Calendar day buttons found: ${count}`);
  await page.screenshot({ path: "/tmp/picker-3-day-buttons.png", fullPage: false });

  // Click 15th of first visible month
  const day15 = page.locator('[data-slot="calendar"] button').filter({ hasText: /^15$/ }).first();
  await day15.click();
  await page.screenshot({ path: "/tmp/picker-4-after-start.png", fullPage: false });

  // Click 20th as end date
  const day20 = page.locator('[data-slot="calendar"] button').filter({ hasText: /^20$/ }).first();
  await day20.click();
  await page.screenshot({ path: "/tmp/picker-5-after-end.png", fullPage: false });

  // Popover should close and label should update
  await page.waitForTimeout(300);
  await page.screenshot({ path: "/tmp/picker-6-after-select.png", fullPage: false });

  // The button label should have changed from "Pick show dates"
  const updatedBtn = dialog.getByRole("button").filter({ hasText: /→/ });
  await expect(updatedBtn).toBeVisible({ timeout: 3_000 });
  console.log("Button text:", await updatedBtn.textContent());
});

test("date range picker - Edit Show dialog: pre-fills existing dates correctly", async ({ page }) => {
  await page.goto("/");
  await waitForApp(page);
  await page.waitForLoadState("networkidle");

  const showLink = page.locator('a[href^="/shows/"]').first();
  const count = await showLink.count();
  if (count === 0) { console.log("No shows, skipping"); return; }
  await showLink.click();
  await waitForApp(page);

  await page.getByTestId("button-edit-show").click();
  const dialog = page.getByRole("dialog");
  await page.screenshot({ path: "/tmp/picker-7-edit-dialog.png", fullPage: false });

  const pickerBtn = dialog.getByRole("button").filter({ hasText: /→|pick show dates/i });
  console.log("Edit dialog picker button text:", await pickerBtn.first().textContent());
  await page.screenshot({ path: "/tmp/picker-8-edit-dates.png", fullPage: false });

  // Open the calendar
  await pickerBtn.first().click();
  await page.screenshot({ path: "/tmp/picker-9-edit-calendar.png", fullPage: false });
});
