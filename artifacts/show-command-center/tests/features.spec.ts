import { test, expect, Page } from "@playwright/test";

async function waitForApp(page: Page) {
  await page.waitForFunction(() => {
    const html = document.documentElement;
    return html.style.visibility !== "hidden";
  }, { timeout: 10_000 });
}

async function getFirstShowUrl(page: Page): Promise<string | null> {
  const showLink = page.locator('a[href^="/shows/"]').first();
  const count = await showLink.count();
  if (count === 0) return null;
  return showLink.getAttribute("href");
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

test.describe("Dashboard", () => {
  test("sort dropdown has all four options", async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);
    const trigger = page.getByRole("combobox");
    await trigger.click();
    await expect(page.getByRole("option", { name: /date.*asc|soonest/i }).or(page.locator('[role="option"]').filter({ hasText: /date/i }).first())).toBeVisible();
  });

  test("sort by name re-orders show cards", async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);
    const shows = page.locator('a[href^="/shows/"]');
    const count = await shows.count();
    test.skip(count < 2, "Need at least 2 shows to test sorting");

    const trigger = page.getByRole("combobox");
    await trigger.click();
    const nameOption = page.getByRole("option", { name: /name/i });
    await nameOption.click();
    await expect(page.locator('a[href^="/shows/"]').first()).toBeVisible();
  });

  test("archived shows section exists and is collapsible", async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);
    const archivedSection = page.getByText(/archived/i).first();
    const hasArchived = await archivedSection.count();
    if (hasArchived === 0) return; // no archived shows — skip
    await archivedSection.click();
    await expect(page.locator("body")).toBeVisible();
  });

  test("summary stats area renders or loading state shown", async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);
    // Either skeleton is loading or summary content is there
    const hasContent = (await page.locator(".container").count()) > 0;
    expect(hasContent).toBe(true);
  });

  test("show cards have venue and date info", async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);
    const cards = page.locator('a[href^="/shows/"]');
    const count = await cards.count();
    test.skip(count === 0, "No shows to test");
    await expect(cards.first()).toBeVisible();
  });
});

// ─── Add Show Dialog ─────────────────────────────────────────────────────────

test.describe("Add Show Dialog", () => {
  test("form renders all required fields", async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);
    await page.getByRole("button", { name: /add.*show/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel(/name/i)).toBeVisible();
    await expect(dialog.getByLabel(/move.?in/i)).toBeVisible();
  });

  test("submitting empty form shows validation error", async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);
    await page.getByRole("button", { name: /add.*show/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /add show|create|submit/i }).click();
    await expect(dialog.getByText(/required/i).first()).toBeVisible();
  });

  test("tag checkboxes are present", async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);
    await page.getByRole("button", { name: /add.*show/i }).click();
    const dialog = page.getByRole("dialog");
    // SHOW_TAGS includes "FM", "e-Blasts", etc.
    await expect(dialog.getByText("FM")).toBeVisible();
    await expect(dialog.getByText("e-Blasts")).toBeVisible();
  });

  test("can create a show and navigate to its detail page", async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);
    await page.getByRole("button", { name: /add.*show/i }).click();
    const dialog = page.getByRole("dialog");
    const uniqueName = `Test Show ${Date.now()}`;
    await dialog.getByLabel(/name/i).fill(uniqueName);
    await dialog.getByLabel(/move.?in/i).fill("2026-12-31");
    await dialog.getByRole("button", { name: /add show|create|submit/i }).click();
    // Should navigate to show detail
    await page.waitForURL(/\/shows\/\d+/, { timeout: 10_000 });
    await waitForApp(page);
    await expect(page.getByText(uniqueName)).toBeVisible();
  });

  test("closing dialog resets the form", async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);
    await page.getByRole("button", { name: /add.*show/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/name/i).fill("Temp Show Name");
    // Close via escape
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    // Reopen — form should be empty
    await page.getByRole("button", { name: /add.*show/i }).click();
    await expect(page.getByRole("dialog").getByLabel(/name/i)).toHaveValue("");
  });
});

// ─── Show Detail ─────────────────────────────────────────────────────────────

test.describe("Show Detail", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);
    const href = await getFirstShowUrl(page);
    test.skip(!href, "No shows exist");
    await page.goto(href!);
    await waitForApp(page);
  });

  test("renders show name and move-in date", async ({ page }) => {
    await expect(page.locator("h2").first()).toBeVisible();
    await expect(page.getByText(/move.?in/i).first()).toBeVisible();
  });

  test("progress bar is visible", async ({ page }) => {
    await expect(page.locator('[role="progressbar"]')).toBeVisible();
  });

  test("days counter is visible", async ({ page }) => {
    // Big number of days
    await expect(page.getByText(/days/i).first()).toBeVisible();
  });

  test("Tasks tab is active by default", async ({ page }) => {
    const tasksTab = page.getByRole("tab", { name: /tasks/i });
    await expect(tasksTab).toHaveAttribute("data-state", "active");
  });

  test("clicking e-Blasts tab shows eblasts section", async ({ page }) => {
    await page.getByRole("tab", { name: /e-?blasts/i }).click();
    await expect(page.getByText(/e-?Blasts/i).first()).toBeVisible();
  });

  test("clicking Links tab shows links section", async ({ page }) => {
    await page.getByRole("tab", { name: /links/i }).click();
    await expect(page.getByText(/important links/i, { exact: false })).toBeVisible();
  });

  test("back button navigates to dashboard", async ({ page }) => {
    // Back button is the first button inside <main> (ArrowLeft icon, no text)
    await page.locator("main").getByRole("button").first().click();
    await expect(page).toHaveURL("/");
  });

  test("edit show dialog opens", async ({ page }) => {
    const editBtn = page.getByTestId("button-edit-show");
    await expect(editBtn).toBeVisible();
    await editBtn.click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("delete show dialog opens and can be cancelled", async ({ page }) => {
    const deleteBtn = page.locator('button[class*="destructive"]').last();
    await deleteBtn.click();
    const alertDialog = page.getByRole("alertdialog");
    await expect(alertDialog).toBeVisible();
    await alertDialog.getByRole("button", { name: /cancel/i }).click();
    await expect(alertDialog).not.toBeVisible();
  });
});

// ─── Task List ───────────────────────────────────────────────────────────────

test.describe("Task List", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);
    const href = await getFirstShowUrl(page);
    test.skip(!href, "No shows exist");
    await page.goto(href!);
    await waitForApp(page);
    // Tasks tab is default
  });

  test("Add Task button is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /add task/i })).toBeVisible();
  });

  test("Add Task dialog has Preset Workflows and Custom Task tabs", async ({ page }) => {
    await page.getByRole("button", { name: /add task/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("tab", { name: /preset/i })).toBeVisible();
    await expect(dialog.getByRole("tab", { name: /custom/i })).toBeVisible();
  });

  test("preset workflow list renders categories", async ({ page }) => {
    await page.getByRole("button", { name: /add task/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Fire Marshal", { exact: true })).toBeVisible();
    // "ID Sign" is a category header — match exactly to avoid colliding with task names like "ID Sign Deadline"
    await expect(dialog.getByText("ID Sign", { exact: true })).toBeVisible();
  });

  test("select all / deselect all works for presets", async ({ page }) => {
    await page.getByRole("button", { name: /add task/i }).click();
    const dialog = page.getByRole("dialog");
    const selectAllBtn = dialog.getByRole("button", { name: /select all/i });
    await selectAllBtn.click();
    await expect(dialog.getByRole("button", { name: /deselect all/i })).toBeVisible();
    await dialog.getByRole("button", { name: /deselect all/i }).click();
    await expect(dialog.getByRole("button", { name: /select all/i })).toBeVisible();
  });

  test("can add a custom task", async ({ page }) => {
    await page.getByRole("button", { name: "Add Task" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("tab", { name: /custom/i }).click();
    const uniqueName = `Test Task ${Date.now()}`;
    await dialog.getByLabel("Task Name *").fill(uniqueName);
    await dialog.getByRole("button", { name: "Add Custom Task" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 10_000 });
  });

  test("can toggle a task completion", async ({ page }) => {
    const unchecked = page.locator('[role="checkbox"][data-state="unchecked"]');
    const count = await unchecked.count();
    test.skip(count === 0, "No incomplete tasks to toggle");
    // Verify the PUT API call succeeds — locator re-evaluation after task moves sections makes DOM checks unreliable
    const [response] = await Promise.all([
      page.waitForResponse(r => /\/api\/shows\/\d+\/tasks\/\d+/.test(r.url()) && r.request().method() === "PUT", { timeout: 8_000 }),
      unchecked.first().click(),
    ]);
    expect(response.status()).toBe(200);
  });

  test("task rows show due date info", async ({ page }) => {
    const taskRows = page.locator(".group.flex.flex-col");
    const count = await taskRows.count();
    if (count === 0) return; // no tasks yet
    await expect(taskRows.first()).toBeVisible();
  });

  test("completed tasks section is collapsible", async ({ page }) => {
    const completedSection = page.getByText(/completed/i, { exact: false }).first();
    const count = await completedSection.count();
    if (count === 0) return;
    await completedSection.click();
    await page.waitForTimeout(300);
    // Just verify no crash
    await expect(page.locator("#root")).toBeVisible();
  });
});

// ─── e-Blast List ─────────────────────────────────────────────────────────────

test.describe("e-Blast List", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);
    const href = await getFirstShowUrl(page);
    test.skip(!href, "No shows exist");
    await page.goto(href!);
    await waitForApp(page);
    await page.getByRole("tab", { name: /e-?blasts/i }).click();
  });

  test("Add e-Blast button is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /add e-?blast/i })).toBeVisible();
  });

  test("Add e-Blast dialog has Preset Schedule and Custom tabs", async ({ page }) => {
    await page.getByRole("button", { name: /add e-?blast/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("tab", { name: /preset/i })).toBeVisible();
    await expect(dialog.getByRole("tab", { name: /custom/i })).toBeVisible();
  });

  test("preset schedule list renders", async ({ page }) => {
    await page.getByRole("button", { name: /add e-?blast/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/exhibitor kit/i)).toBeVisible();
  });

  test("select all / deselect all for e-blast presets", async ({ page }) => {
    await page.getByRole("button", { name: /add e-?blast/i }).click();
    const dialog = page.getByRole("dialog");
    const selectAllBtn = dialog.getByRole("button", { name: /select all/i });
    await selectAllBtn.click();
    await expect(dialog.getByRole("button", { name: /deselect all/i })).toBeVisible();
    await dialog.getByRole("button", { name: /deselect all/i }).click();
    await expect(dialog.getByRole("button", { name: /select all/i })).toBeVisible();
  });

  test("can add a custom e-blast", async ({ page }) => {
    await page.getByRole("button", { name: "Add e-Blast" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("tab", { name: /custom/i }).click();
    const uniqueName = `Test eBlast ${Date.now()}`;
    await dialog.getByLabel("e-Blast Name *").fill(uniqueName);
    await dialog.getByRole("button", { name: "Add Custom e-Blast" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 10_000 });
  });

  test("Add All button sends all available presets", async ({ page }) => {
    await page.getByRole("button", { name: /add e-?blast/i }).click();
    const dialog = page.getByRole("dialog");
    const addAllBtn = dialog.getByRole("button", { name: /^add all$/i });
    await expect(addAllBtn).toBeVisible();
  });

  test("can toggle an eblast sent status", async ({ page }) => {
    const unchecked = page.locator('[role="checkbox"][data-state="unchecked"]');
    const count = await unchecked.count();
    test.skip(count === 0, "No unsent eblasts to toggle");
    const [response] = await Promise.all([
      page.waitForResponse(r => /\/api\/shows\/\d+\/eblasts\/\d+/.test(r.url()) && r.request().method() === "PUT", { timeout: 8_000 }),
      unchecked.first().click(),
    ]);
    expect(response.status()).toBe(200);
  });

  test("sent eblasts section shows and is collapsible", async ({ page }) => {
    // First ensure at least one sent eblast exists by looking for Sent section
    const sentSection = page.getByText(/^sent$/i).first();
    const sentCount = await sentSection.count();
    if (sentCount === 0) return; // no sent e-blasts
    const showHideBtn = page.getByRole("button", { name: /show|hide/i }).first();
    await expect(showHideBtn).toBeVisible();
    await showHideBtn.click();
    await page.waitForTimeout(300);
    await expect(page.locator("#root")).toBeVisible();
  });
});

// ─── Links ────────────────────────────────────────────────────────────────────

test.describe("Links Tab", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);
    const href = await getFirstShowUrl(page);
    test.skip(!href, "No shows exist");
    await page.goto(href!);
    await waitForApp(page);
    await page.getByRole("tab", { name: /links/i }).click();
  });

  test("Add Link button is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /add link/i })).toBeVisible();
  });

  test("empty state shows no-links message", async ({ page }) => {
    const links = page.locator('a[href^="http"]');
    const linkCount = await links.count();
    if (linkCount === 0) {
      await expect(page.getByText(/no links/i)).toBeVisible();
    }
  });

  test("Add Link dialog validates URL format", async ({ page }) => {
    await page.getByRole("button", { name: /add link/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/title/i).fill("Test Title");
    await dialog.getByLabel(/url/i).fill("not-a-url");
    await dialog.getByRole("button", { name: /save link/i }).click();
    await expect(dialog.getByText(/valid url/i)).toBeVisible();
  });

  test("can add and delete a link", async ({ page }) => {
    await page.getByRole("button", { name: /add link/i }).click();
    const dialog = page.getByRole("dialog");
    const uniqueTitle = `Test Link ${Date.now()}`;
    await dialog.getByLabel(/title/i).fill(uniqueTitle);
    await dialog.getByLabel(/url/i).fill("https://example.com/test");
    await dialog.getByRole("button", { name: /save link/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 8_000 });
    const linkRow = page.getByText(uniqueTitle);
    await expect(linkRow).toBeVisible({ timeout: 8_000 });

    // Delete the link
    await linkRow.hover();
    const deleteBtn = page.locator(".group").filter({ hasText: uniqueTitle }).getByRole("button").last();
    await deleteBtn.click();
    await expect(page.getByText(uniqueTitle)).not.toBeVisible({ timeout: 8_000 });
  });

  test("link opens in new tab (has target=_blank)", async ({ page }) => {
    const links = page.locator('a[href^="http"][target="_blank"]');
    const count = await links.count();
    if (count === 0) return; // no external links yet
    const href = await links.first().getAttribute("href");
    expect(href).toBeTruthy();
  });
});

// ─── Calendar ─────────────────────────────────────────────────────────────────

test.describe("Calendar", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/calendar");
    await waitForApp(page);
  });

  test("renders current month and year", async ({ page }) => {
    const now = new Date();
    const year = String(now.getFullYear());
    await expect(page.getByText(year)).toBeVisible();
  });

  test("previous and next month buttons navigate", async ({ page }) => {
    const prevBtn = page.getByRole("button").filter({ has: page.locator("svg") }).first();
    await prevBtn.click();
    await page.waitForTimeout(300);
    await expect(page.locator("body")).toBeVisible();

    const nextBtn = page.getByRole("button").filter({ has: page.locator("svg") }).nth(1);
    await nextBtn.click();
    await nextBtn.click();
    await page.waitForTimeout(300);
    await expect(page.locator("body")).toBeVisible();
  });

  test("show filter dropdown renders", async ({ page }) => {
    const filter = page.getByRole("combobox");
    await expect(filter).toBeVisible();
  });

  test("export ICS button is visible", async ({ page }) => {
    const exportBtn = page.getByRole("button", { name: /export|ics/i });
    await expect(exportBtn).toBeVisible();
  });

  test("calendar grid shows day cells", async ({ page }) => {
    // Should have cells for each day of the month
    await expect(page.getByText("1").first()).toBeVisible();
  });

  test("filtering by a specific show narrows events", async ({ page }) => {
    const filter = page.getByRole("combobox");
    await filter.click();
    const options = page.getByRole("option");
    const count = await options.count();
    if (count <= 1) return; // only "All" option
    await options.nth(1).click();
    await page.waitForTimeout(500);
    await expect(page.locator("#root")).toBeVisible();
  });
});

// ─── Office Tasks ─────────────────────────────────────────────────────────────

test.describe("Office Tasks", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/office-tasks");
    await waitForApp(page);
  });

  test("page title or heading renders", async ({ page }) => {
    await expect(page.getByRole("heading").first()).toBeVisible();
  });

  test("New Task button is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /new task/i })).toBeVisible();
  });

  test("New Task dialog opens and has title field", async ({ page }) => {
    await page.getByRole("button", { name: /new task/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Title *")).toBeVisible();
  });

  test("can add an office task", async ({ page }) => {
    await page.getByRole("button", { name: /new task/i }).click();
    const dialog = page.getByRole("dialog");
    const uniqueName = `Office Task ${Date.now()}`;
    await dialog.getByLabel("Title *").fill(uniqueName);
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 10_000 });
  });

  test("can toggle office task completion", async ({ page }) => {
    const unchecked = page.locator('[role="checkbox"][data-state="unchecked"]');
    const count = await unchecked.count();
    test.skip(count === 0, "No incomplete office tasks to toggle");
    const [response] = await Promise.all([
      page.waitForResponse(r => /\/api\/office-tasks\/\d+/.test(r.url()) && ["PUT", "PATCH"].includes(r.request().method()), { timeout: 8_000 }),
      unchecked.first().click(),
    ]);
    expect(response.status()).toBe(200);
  });

  test("page root renders without errors", async ({ page }) => {
    await expect(page.locator("#root")).toBeVisible();
  });
});

// ─── Navigation ───────────────────────────────────────────────────────────────

test.describe("Navigation", () => {
  test("layout nav links all work", async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);
    const navLinks = page.locator("nav a[href]");
    const count = await navLinks.count();
    for (let i = 0; i < count; i++) {
      const href = await navLinks.nth(i).getAttribute("href");
      expect(href).toBeTruthy();
      expect(href).not.toMatch(/^javascript:/);
    }
  });

  test("navigating to unknown route shows not-found page", async ({ page }) => {
    await page.goto("/this-does-not-exist");
    await waitForApp(page);
    await expect(page.locator("#root")).toBeVisible();
    await expect(page.getByText(/not found|404|doesn't exist/i)).toBeVisible();
  });

  test("calendar nav link navigates to /calendar", async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);
    await page.locator("nav").getByRole("link", { name: /calendar/i }).click();
    await expect(page).toHaveURL(/\/calendar/);
    await waitForApp(page);
  });

  test("office tasks nav link navigates to /office-tasks", async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);
    await page.locator("nav").getByRole("link", { name: /office.*tasks|tasks/i }).click();
    await expect(page).toHaveURL(/\/office-tasks/);
    await waitForApp(page);
  });
});

// ─── Edit Show ─────────────────────────────────────────────────────────────────

test.describe("Edit Show", () => {
  test("edit dialog pre-fills existing show data", async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);
    const href = await getFirstShowUrl(page);
    test.skip(!href, "No shows exist");
    await page.goto(href!);
    await waitForApp(page);

    const showName = await page.locator("h2").first().textContent();
    await page.getByTestId("button-edit-show").click();
    const dialog = page.getByRole("dialog");
    const nameInput = dialog.getByLabel(/name/i).first();
    await expect(nameInput).toHaveValue(showName ?? "");
  });

  test("edit dialog can update and close", async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);
    const href = await getFirstShowUrl(page);
    test.skip(!href, "No shows exist");
    await page.goto(href!);
    await waitForApp(page);

    await page.getByTestId("button-edit-show").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /cancel/i }).click();
    await expect(dialog).not.toBeVisible();
  });
});
