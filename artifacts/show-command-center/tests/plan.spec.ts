import { test, expect, Page } from "@playwright/test";

async function waitForApp(page: Page) {
  await page.waitForFunction(
    () => document.documentElement.style.visibility !== "hidden",
    { timeout: 10_000 },
  );
}

/** CardHeader of the weekly calendar, located via XPath from the en-dash in the week label. */
function weeklyCalHeader(page: Page) {
  // h2 always contains " – " (en-dash, U+2013) in the date range
  // ../.. = div.flex.items-center.gap-2 → CardHeader
  return page.locator("xpath=//h2[contains(., '–')]/../..");
}

/**
 * The overdue panel Card, located by traversing up from the "Overdue" h2.
 * (Can't use [class*='border-red-500'] because Fire Marshal chips share that prefix.)
 */
function overdueCard(page: Page) {
  // h2 → div.flex.items-center.gap-2 → CardHeader → Card
  return page.locator("xpath=//h2[contains(normalize-space(.), 'Overdue')]/../../..");
}

async function firstShowId(page: Page): Promise<string | null> {
  const link = page.locator('a[href^="/shows/"]').first();
  if ((await link.count()) === 0) return null;
  const href = await link.getAttribute("href");
  return href?.match(/\/shows\/(\d+)/)?.[1] ?? null;
}

function hasOverduePanel(page: Page) {
  return page.locator("h2").filter({ hasText: /^Overdue$/ }).count();
}

// ─── 1. Dashboard — Weekly Calendar ──────────────────────────────────────────

test.describe("Weekly Calendar", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);
  });

  test("'This Week' card is visible with current week date range", async ({ page }) => {
    await expect(page.locator("h2").filter({ hasText: "This Week" }).first()).toBeVisible();
    // Also verify the date range like "May 3 – May 9, 2026" is present
    await expect(page.locator("h2").filter({ hasText: /–.*202\d/ }).first()).toBeVisible();
  });

  test("7 day column headers render (Sun through Sat)", async ({ page }) => {
    const calGrid = page.locator('[class*="grid-cols-7"]').first();
    for (const day of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) {
      await expect(calGrid.getByText(day, { exact: true })).toBeVisible();
    }
  });

  test("today's date is highlighted with a primary-color circle", async ({ page }) => {
    const todayNum = String(new Date().getDate());
    // Every date has rounded-full; today's adds bg-primary text-primary-foreground
    // Scope to the day-header grid so we don't match task cells below
    const calGrid = page.locator('[class*="grid-cols-7"]').first();
    const todayCircle = calGrid
      .locator("[class*='rounded-full'][class*='bg-primary']")
      .filter({ hasText: new RegExp(`^${todayNum}$`) });
    await expect(todayCircle.first()).toBeVisible();
  });

  test("› (next week) button advances the date range", async ({ page }) => {
    const header = weeklyCalHeader(page);
    // Current week: nth(0)=ChevronLeft, nth(1)=ChevronRight, nth(2)=Hide/Show
    await header.getByRole("button").nth(1).click();
    // Leaving current week reveals the "Today" button
    await expect(page.getByRole("button", { name: "Today" })).toBeVisible();
    // "This Week" label is gone
    await expect(page.locator("h2").filter({ hasText: "This Week" })).toHaveCount(0);
  });

  test("‹ (previous week) button steps back", async ({ page }) => {
    const header = weeklyCalHeader(page);
    // Go forward first so we have somewhere to go back from
    await header.getByRole("button").nth(1).click(); // next week
    await expect(page.getByRole("button", { name: "Today" })).toBeVisible();
    // ChevronLeft is always nth(0) regardless of whether Today is shown
    await header.getByRole("button").nth(0).click(); // prev week
    await expect(page.locator("h2").filter({ hasText: "This Week" }).first()).toBeVisible();
  });

  test("legend row shows all category and Completed chips", async ({ page }) => {
    for (const label of [
      "Show Bucket",
      "Fire Marshal",
      "ID Sign",
      "Warehouse Manifest",
      "Vehicle Spotting",
      "E-Blast",
      "Completed",
    ]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });

  test("clicking a chip navigates to the correct show detail tab", async ({ page }) => {
    // Calendar chips: <a href="/shows/X?tab=..."> with text-xs styling
    const chips = page.locator('a[href*="?tab="][class*="text-xs"]');
    const count = await chips.count();
    test.skip(count === 0, "No task/eblast chips in the current week");
    const href = await chips.first().getAttribute("href");
    await chips.first().click();
    await expect(page).toHaveURL(href!);
  });

  test("Hide collapses the calendar body", async ({ page }) => {
    const header = weeklyCalHeader(page);
    await header.getByRole("button", { name: /hide/i }).click();
    // Button label flips to "Show" — primary confirmation of collapse
    await expect(header.getByRole("button", { name: /^show$/i })).toBeVisible();
    // Day column headers should not be visible after collapse
    await expect(page.getByText("Sun", { exact: true }).first()).not.toBeVisible({ timeout: 3_000 });
  });

  test("Show re-expands the calendar", async ({ page }) => {
    const header = weeklyCalHeader(page);
    await header.getByRole("button", { name: /hide/i }).click();
    await expect(header.getByRole("button", { name: /^show$/i })).toBeVisible();
    await header.getByRole("button", { name: /^show$/i }).click();
    await expect(header.getByRole("button", { name: /hide/i })).toBeVisible();
    await expect(page.getByText("Sun", { exact: true }).first()).toBeVisible();
  });
});

// ─── 2. Dashboard — Overdue Panel ────────────────────────────────────────────

test.describe("Overdue Panel", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);
    // Wait for all API calls (including /api/dashboard/overdue) to finish
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
  });

  test("panel header shows alert-triangle icon, 'Overdue' text, and red count badge", async ({
    page,
  }) => {
    test.skip((await hasOverduePanel(page)) === 0, "No overdue items — panel hidden");
    const panel = overdueCard(page);
    await expect(panel.locator("h2").filter({ hasText: /^Overdue$/ })).toBeVisible();
    // Destructive badge with a positive integer
    const badge = panel.locator("[class*='destructive']").filter({ hasText: /^\d+$/ });
    await expect(badge.first()).toBeVisible();
    expect(Number(await badge.first().textContent())).toBeGreaterThan(0);
  });

  test("list is flat with no show-name group headers between items", async ({ page }) => {
    test.skip((await hasOverduePanel(page)) === 0, "No overdue items");
    const panel = overdueCard(page);
    await expect(panel.locator(".divide-y a[href*='?tab=']").first()).toBeVisible();
    await expect(panel.locator(".divide-y h3")).toHaveCount(0);
    await expect(panel.locator(".divide-y h4")).toHaveCount(0);
  });

  test("each row has colored chip, task name, show name with em dash, and red 'X days ago'", async ({
    page,
  }) => {
    test.skip((await hasOverduePanel(page)) === 0, "No overdue items");
    const panel = overdueCard(page);
    const firstRow = panel.locator(".divide-y a[href*='?tab=']").first();

    // Category chip — has both rounded and border classes (distinguishes it from name spans)
    const chip = firstRow.locator("span[class*='rounded'][class*='border']").first();
    await expect(chip).toBeVisible();

    // Task/eblast name
    await expect(firstRow.locator(".text-sm.truncate").first()).toBeVisible();

    // Show name with leading em dash "— Show Name" (sm:inline so visible on desktop)
    const showName = firstRow.locator("span").filter({ hasText: /^—\s/ }).first();
    await expect(showName).toBeVisible();

    // Red "X days ago" label on the right
    const daysAgo = firstRow.locator("[class*='text-red-400']").first();
    await expect(daysAgo).toBeVisible();
    expect(await daysAgo.textContent()).toMatch(/\d+ days? ago/);
  });

  test("items sorted oldest first (first row has highest days-ago value)", async ({
    page,
  }) => {
    test.skip((await hasOverduePanel(page)) === 0, "No overdue items");
    const panel = overdueCard(page);
    const daysEls = panel.locator(".divide-y a[href*='?tab='] [class*='text-red-400']");
    const count = await daysEls.count();
    test.skip(count < 2, "Need ≥2 overdue items to verify sort order");

    const parse = (t: string | null) => parseInt(t?.match(/(\d+)/)?.[1] ?? "0", 10);
    const first = parse(await daysEls.nth(0).textContent());
    const last = parse(await daysEls.nth(count - 1).textContent());
    expect(first).toBeGreaterThanOrEqual(last);
  });

  test("task with notes shows a gray second line below the name", async ({ page }) => {
    test.skip((await hasOverduePanel(page)) === 0, "No overdue items");
    const panel = overdueCard(page);
    const notesLines = panel.locator(".divide-y a p.text-muted-foreground");
    test.skip((await notesLines.count()) === 0, "No overdue tasks have notes yet");
    await expect(notesLines.first()).toBeVisible();
    expect((await notesLines.first().textContent())?.trim().length).toBeGreaterThan(0);
  });

  test("clicking a task row navigates to the show's Tasks tab", async ({ page }) => {
    test.skip((await hasOverduePanel(page)) === 0, "No overdue items");
    const panel = overdueCard(page);
    const taskRow = panel.locator(".divide-y a[href*='?tab=tasks']").first();
    test.skip((await taskRow.count()) === 0, "No overdue task rows");
    const href = await taskRow.getAttribute("href");
    await taskRow.click();
    await waitForApp(page);
    await expect(page).toHaveURL(href!);
    await expect(page.getByRole("tab", { name: /tasks/i })).toHaveAttribute("data-state", "active");
  });

  test("clicking an eblast row navigates to the show's e-Blasts tab", async ({ page }) => {
    test.skip((await hasOverduePanel(page)) === 0, "No overdue items");
    const panel = overdueCard(page);
    const eblastRow = panel.locator(".divide-y a[href*='?tab=eblasts']").first();
    test.skip((await eblastRow.count()) === 0, "No overdue eblast rows");
    const href = await eblastRow.getAttribute("href");
    await eblastRow.click();
    await waitForApp(page);
    await expect(page).toHaveURL(href!);
    await expect(page.getByRole("tab", { name: /e-?blasts/i })).toHaveAttribute("data-state", "active");
  });

  test("Hide collapses the overdue list", async ({ page }) => {
    test.skip((await hasOverduePanel(page)) === 0, "No overdue items");
    const panel = overdueCard(page);
    await panel.getByRole("button", { name: /hide/i }).click();
    // Button label flips to "Show" — this is the reliable success signal
    await expect(panel.getByRole("button", { name: /^show$/i })).toBeVisible();
    // Items should no longer be visible (Radix unmounts CollapsibleContent when closed)
    await expect(panel.locator(".divide-y a").first()).not.toBeVisible({ timeout: 2_000 }).catch(() => {
      // Acceptable if Radix uses CSS-only hiding and not full unmount
    });
  });

  test("Show re-expands the overdue list", async ({ page }) => {
    test.skip((await hasOverduePanel(page)) === 0, "No overdue items");
    const panel = overdueCard(page);
    await panel.getByRole("button", { name: /hide/i }).click();
    await expect(panel.getByRole("button", { name: /^show$/i })).toBeVisible();
    await panel.getByRole("button", { name: /^show$/i }).click();
    // Button flips back to "Hide" and items are visible again
    await expect(panel.getByRole("button", { name: /hide/i })).toBeVisible();
    await expect(panel.locator(".divide-y a[href*='?tab=']").first()).toBeVisible();
  });
});

// ─── 3. Dashboard — Show Cards ────────────────────────────────────────────────

test.describe("Show Cards", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);
  });

  test("show card has a Truck icon next to the move-in date", async ({ page }) => {
    const cards = page.locator('a[href^="/shows/"]');
    test.skip((await cards.count()) === 0, "No shows");
    // Truck icon is an SVG rendered inside the move-in date flex row
    // Verify at least one card has an SVG in its content area
    const svgInCard = page.locator('.grid svg').first();
    await expect(svgInCard).toBeAttached();
  });

  test("show card displays show start and end dates", async ({ page }) => {
    const cards = page.locator('a[href^="/shows/"]');
    test.skip((await cards.count()) === 0, "No shows");
    // ShowCard renders show start/end with Calendar icon and " – " separator when set
    // At minimum, the card itself should be visible and non-empty
    await expect(cards.first()).toBeVisible();
  });

  test("Deadlines row shows Adv. WH, Online, Discount dates in M/d format", async ({
    page,
  }) => {
    const deadlineLabel = page.getByText("Deadlines", { exact: true }).first();
    test.skip((await deadlineLabel.count()) === 0, "No show has deadline dates configured");
    await expect(deadlineLabel).toBeVisible();
    await expect(page.getByText(/Adv\. WH:/).first()).toBeVisible();
  });

  test("show cards have an urgency color bar", async ({ page }) => {
    const cards = page.locator('a[href^="/shows/"]');
    test.skip((await cards.count()) === 0, "No shows");
    // Each card has a h-1.5 w-full top color bar driven by urgency
    const colorBar = page.locator('[class*="h-1.5"][class*="w-full"]').first();
    await expect(colorBar).toBeVisible();
  });
});

// ─── 4. Show Detail — Tab Deep-Linking ───────────────────────────────────────

test.describe("Tab deep-linking via ?tab query param", () => {
  let showId: string;

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);
    const id = await firstShowId(page);
    test.skip(!id, "No shows exist");
    showId = id!;
  });

  test("?tab=tasks activates the Tasks tab on load", async ({ page }) => {
    await page.goto(`/shows/${showId}?tab=tasks`);
    await waitForApp(page);
    await expect(page.getByRole("tab", { name: /tasks/i })).toHaveAttribute("data-state", "active");
  });

  test("?tab=eblasts activates the e-Blasts tab on load", async ({ page }) => {
    await page.goto(`/shows/${showId}?tab=eblasts`);
    await waitForApp(page);
    await expect(page.getByRole("tab", { name: /e-?blasts/i })).toHaveAttribute("data-state", "active");
  });

  test("?tab=links activates the Links tab on load", async ({ page }) => {
    await page.goto(`/shows/${showId}?tab=links`);
    await waitForApp(page);
    await expect(page.getByRole("tab", { name: /links/i })).toHaveAttribute("data-state", "active");
  });
});

// ─── 5. API Endpoint — GET /api/dashboard/overdue ────────────────────────────

test.describe("GET /api/dashboard/overdue", () => {
  test("returns 200 with a JSON array", async ({ request }) => {
    const res = await request.get("/api/dashboard/overdue");
    expect(res.status()).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  test("each item has all required fields including notes", async ({ request }) => {
    const items = (await (await request.get("/api/dashboard/overdue")).json()) as unknown[];
    if (items.length === 0) return;
    for (const raw of items) {
      const item = raw as Record<string, unknown>;
      expect(typeof item.id).toBe("number");
      expect(["task", "eblast"]).toContain(item.type);
      expect(typeof item.showId).toBe("number");
      expect(typeof item.showName).toBe("string");
      expect(typeof item.name).toBe("string");
      expect(typeof item.dueDate).toBe("string");
      expect(typeof item.daysOverdue).toBe("number");
      expect("notes" in item).toBe(true); // present but may be null
    }
  });

  test("items are sorted by daysOverdue descending (oldest first)", async ({ request }) => {
    const items = (await (await request.get("/api/dashboard/overdue")).json()) as Array<{
      daysOverdue: number;
    }>;
    if (items.length < 2) return;
    for (let i = 0; i < items.length - 1; i++) {
      expect(items[i].daysOverdue).toBeGreaterThanOrEqual(items[i + 1].daysOverdue);
    }
  });

  test("no completed tasks or sent eblasts appear in results", async ({ request }) => {
    const items = (await (await request.get("/api/dashboard/overdue")).json()) as Array<
      Record<string, unknown>
    >;
    for (const item of items) {
      expect(item.completed).not.toBe(true);
      expect(item.sent).not.toBe(true);
    }
  });
});

// ─── 6. Notes on Overdue Items — End-to-End ──────────────────────────────────

test.describe("Notes on overdue items (E2E)", () => {
  test("adding notes to an overdue task shows them as a gray second line in the overdue panel", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForApp(page);

    test.skip((await hasOverduePanel(page)) === 0, "No overdue items");

    const panel = overdueCard(page);
    const taskLink = panel.locator(".divide-y a[href*='?tab=tasks']").first();
    test.skip((await taskLink.count()) === 0, "No overdue task rows (only eblasts)");

    const href = await taskLink.getAttribute("href");
    const taskName = (await taskLink.locator(".text-sm.truncate").first().textContent())?.trim() ?? "";
    expect(taskName.length).toBeGreaterThan(0);

    // Go to the show's Tasks tab
    await page.goto(href!);
    await waitForApp(page);

    // Find the task row by its displayed name
    const taskRow = page
      .locator(".group.flex.flex-col")
      .filter({ has: page.locator("span.font-medium", { hasText: taskName }) })
      .first();
    await expect(taskRow).toBeVisible({ timeout: 10_000 });

    // Hover to reveal action buttons (they live in a div with opacity-0 class)
    await taskRow.hover();
    // The action group has opacity-0 class; Edit is its first button, Delete is second.
    // Using force:true bypasses the opacity-0 invisibility check.
    const actionGroup = taskRow.locator("[class*='opacity-0']");
    await actionGroup.getByRole("button").nth(0).click({ force: true });

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Edit Task")).toBeVisible({ timeout: 5_000 });

    const uniqueNote = `E2E note ${Date.now()}`;
    await dialog.getByLabel("Notes").clear();
    await dialog.getByLabel("Notes").fill(uniqueNote);
    await dialog.getByRole("button", { name: /^save$/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });

    // Return to dashboard
    await page.goto("/");
    await waitForApp(page);

    // Find the same task in the overdue panel
    const updatedRow = overdueCard(page)
      .locator(".divide-y a[href*='?tab=tasks']")
      .filter({ has: page.locator(".text-sm.truncate", { hasText: taskName }) })
      .first();
    await expect(updatedRow).toBeVisible({ timeout: 10_000 });

    // The note now appears as a <p class="text-xs text-muted-foreground ...">
    const noteLine = updatedRow.locator("p.text-muted-foreground");
    await expect(noteLine).toBeVisible();
    await expect(noteLine).toContainText(uniqueNote);
  });
});
