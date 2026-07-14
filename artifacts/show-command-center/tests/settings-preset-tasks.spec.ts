import { test, expect, Page } from "@playwright/test";

async function waitForApp(page: Page) {
  await page.waitForFunction(
    () => document.documentElement.style.visibility !== "hidden",
    { timeout: 10_000 },
  );
}

async function openPresetSection(page: Page) {
  const toggle = page.locator("button").filter({ hasText: /preset task templates/i }).first();
  const content = page.locator("h3").filter({ hasText: "Fire Marshal" }).first();
  const isExpanded = await content.isVisible().catch(() => false);
  if (!isExpanded) await toggle.click();
  await expect(content).toBeVisible({ timeout: 5_000 });
}

/** Find the category section container by its heading text. */
function categorySection(page: Page, cat: string) {
  return page
    .locator(".space-y-2")
    .filter({ has: page.locator("h3", { hasText: cat }) })
    .first();
}

/** Add a preset via the Settings form; returns when the new row is visible. */
async function addPreset(
  page: Page,
  cat: string,
  name: string,
  offset?: number,
) {
  const section = categorySection(page, cat);
  await section.getByRole("button", { name: /^add$/i }).click();
  await page.getByPlaceholder("Task name *").fill(name);
  if (offset != null) {
    await page.getByPlaceholder("Offset (days)").fill(String(offset));
  }
  await page.getByRole("button", { name: /^save$/i }).click();
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 10_000 });
}

/** Hover a preset row and click its delete button, then confirm. */
async function deletePreset(page: Page, name: string) {
  const row = page.locator(".group").filter({ hasText: name }).first();
  await row.hover();
  // Two icon buttons inside the actions area: 0=Edit, 1=Delete
  await row.locator("button").nth(1).click();
  await page.getByRole("button", { name: /^delete$/i }).click();
  await expect(page.locator(".group").filter({ hasText: name })).toHaveCount(0, { timeout: 10_000 });
}

const PRESET_CATEGORIES = [
  "Fire Marshal",
  "ID Sign",
  "Warehouse Manifest",
  "Show Bucket",
  "Vehicle Spotting",
  "Electrical",
];

test.describe("Settings — Preset Tasks", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings");
    await waitForApp(page);
    await openPresetSection(page);
  });

  // ─── Navigation ──────────────────────────────────────────────────────────

  test("Settings nav link navigates to /settings", async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);
    await page.getByRole("link", { name: /settings/i }).click();
    await expect(page).toHaveURL("/settings");
    await expect(page.getByRole("heading", { name: /^settings$/i })).toBeVisible();
  });

  // ─── Page structure ──────────────────────────────────────────────────────

  test("shows all 6 category section headers", async ({ page }) => {
    for (const cat of PRESET_CATEGORIES) {
      await expect(
        page
          .locator(".font-semibold.uppercase.tracking-wider")
          .filter({ hasText: cat })
          .first(),
      ).toBeVisible();
    }
  });

  test("each category has an Add button", async ({ page }) => {
    for (const cat of PRESET_CATEGORIES) {
      await expect(
        categorySection(page, cat).getByRole("button", { name: /^add$/i }),
      ).toBeVisible();
    }
  });

  test("seeded Fire Marshal presets are visible", async ({ page }) => {
    await expect(
      page.getByText("Initial Contact Account Executive"),
    ).toBeVisible();
    await expect(page.getByText("Submit To FM/EC")).toBeVisible();
    await expect(page.getByText("Hard Deadline")).toBeVisible();
  });

  test("seeded presets show their rule labels", async ({ page }) => {
    // "Initial Contact Account Executive" → 60 cal days before move-in
    await expect(page.getByText(/60 cal days before move-in/).first()).toBeVisible();
    // Warehouse Manifest → 3 biz days before Advance Warehouse
    await expect(
      page.getByText(/3 biz days before Advance Warehouse/).first(),
    ).toBeVisible();
    // "Bucket Due Date" → Manual entry
    await expect(page.getByText(/manual entry/i).first()).toBeVisible();
  });

  // ─── Add preset ──────────────────────────────────────────────────────────

  test("adding a preset with an offset shows the correct rule label", async ({
    page,
  }) => {
    const name = `PW Add Offset ${Date.now()}`;
    await addPreset(page, "Fire Marshal", name, 45);
    // Rule label: "45 cal days before move-in"
    await expect(page.getByText(/45 cal days before move-in/).first()).toBeVisible();
    await deletePreset(page, name);
  });

  test("adding a preset without an offset shows 'Manual entry'", async ({
    page,
  }) => {
    const name = `PW Add Manual ${Date.now()}`;
    const section = categorySection(page, "Show Bucket");
    await section.getByRole("button", { name: /^add$/i }).click();
    await page.getByPlaceholder("Task name *").fill(name);
    // Verify helper text for manual mode
    await expect(page.getByText(/leave offset blank/i)).toBeVisible();
    await page.getByRole("button", { name: /^save$/i }).click();
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/manual entry/i).first()).toBeVisible();
    await deletePreset(page, name);
  });

  test("Save is disabled when the name field is empty", async ({ page }) => {
    await categorySection(page, "Electrical")
      .getByRole("button", { name: /^add$/i })
      .click();
    await expect(page.getByRole("button", { name: /^save$/i })).toBeDisabled();
    await page.getByPlaceholder("Task name *").fill("x");
    await expect(page.getByRole("button", { name: /^save$/i })).toBeEnabled();
    // Cancel to clean up
    await page.getByRole("button", { name: /^cancel$/i }).click();
  });

  test("Cancel closes the add form without creating a preset", async ({
    page,
  }) => {
    const name = `PW Cancel ${Date.now()}`;
    await categorySection(page, "ID Sign")
      .getByRole("button", { name: /^add$/i })
      .click();
    await page.getByPlaceholder("Task name *").fill(name);
    await page.getByRole("button", { name: /^cancel$/i }).click();
    await expect(page.getByText(name)).not.toBeVisible();
  });

  // ─── Edit preset ─────────────────────────────────────────────────────────

  test("editing a preset updates its displayed name", async ({ page }) => {
    const original = `PW Edit Orig ${Date.now()}`;
    const updated = `PW Edit Updated ${Date.now()}`;

    await addPreset(page, "ID Sign", original, 20);

    // Hover and click Edit (first icon button)
    const row = page.locator(".group").filter({ hasText: original }).first();
    await row.hover();
    await row.locator("button").nth(0).click();

    // Replace name in the inline form
    const nameInput = page.getByPlaceholder("Task name *");
    await nameInput.fill(updated);
    await page.getByRole("button", { name: /^save$/i }).click();

    await expect(page.getByText(updated).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(original)).not.toBeVisible();

    await deletePreset(page, updated);
  });

  // ─── Delete preset ────────────────────────────────────────────────────────

  test("Cancel on the delete dialog keeps the preset", async ({ page }) => {
    const name = `PW Del Cancel ${Date.now()}`;
    await addPreset(page, "Vehicle Spotting", name, 10);

    const row = page.locator(".group").filter({ hasText: name }).first();
    await row.hover();
    await row.locator("button").nth(1).click();
    // Cancel the confirmation
    await page.getByRole("button", { name: /^cancel$/i }).click();

    await expect(page.getByText(name).first()).toBeVisible();
    await deletePreset(page, name);
  });

  test("confirming delete removes the preset from the list", async ({ page }) => {
    const name = `PW Del Confirm ${Date.now()}`;
    await addPreset(page, "Warehouse Manifest", name);
    await deletePreset(page, name); // deletes and asserts gone
  });

  // ─── Integration with Add Task dialog ────────────────────────────────────

  test("preset added in Settings appears in the Add Task dialog preset tab", async ({
    page,
  }) => {
    // Find a show to use
    await page.goto("/");
    await waitForApp(page);
    const showLink = page.locator('a[href^="/shows/"]').first();
    if ((await showLink.count()) === 0) {
      test.skip(true, "No shows exist — skipping integration test");
      return;
    }
    const showHref = await showLink.getAttribute("href");

    // Add a uniquely named preset
    await page.goto("/settings");
    await waitForApp(page);
    await openPresetSection(page);
    const name = `PW Integration ${Date.now()}`;
    await addPreset(page, "Electrical", name, 3);

    // Open Add Task dialog on the show
    await page.goto(showHref!);
    await waitForApp(page);
    await page.getByRole("button", { name: /add task/i }).click();
    const dialog = page.getByRole("dialog");
    // "Preset Workflows" tab is default; the new preset should be listed
    await expect(dialog.getByText(name)).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press("Escape");

    // Cleanup
    await page.goto("/settings");
    await waitForApp(page);
    await openPresetSection(page);
    await deletePreset(page, name);
  });
});
