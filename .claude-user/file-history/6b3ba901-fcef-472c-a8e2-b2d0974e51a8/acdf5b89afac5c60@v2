import { test, expect, Page } from "@playwright/test";

async function waitForApp(page: Page) {
  await page.waitForFunction(
    () => document.documentElement.style.visibility !== "hidden",
    { timeout: 10_000 },
  );
}

async function getFirstShowUrl(page: Page): Promise<string | null> {
  const link = page.locator('a[href^="/shows/"]').first();
  return (await link.count()) > 0 ? link.getAttribute("href") : null;
}

async function addTaskWithCategory(page: Page, name: string, category: string) {
  await page.getByRole("button", { name: /add task/i }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: /custom/i }).click();
  await dialog.getByLabel("Task Name *").fill(name);
  // The category Select is the only combobox in this form
  await dialog.getByRole("combobox").click();
  await page.getByRole("option", { name: category }).click();
  await dialog.getByRole("button", { name: /add custom task/i }).click();
  await expect(dialog).not.toBeVisible({ timeout: 10_000 });
}

test.describe("Task toolbar — Filter / Sort / Group", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);
    const href = await getFirstShowUrl(page);
    test.skip(!href, "No shows exist");
    await page.goto(href!);
    await waitForApp(page);
    // Tasks tab is the default
  });

  // ─── Toolbar ─────────────────────────────────────────────────────────────

  test("toolbar renders with all controls when tasks exist", async ({ page }) => {
    await addTaskWithCategory(page, `Toolbar Test ${Date.now()}`, "Electrical");
    const toolbar = page.locator('[data-testid="task-toolbar"]');
    await expect(toolbar).toBeVisible();
    await expect(toolbar.getByRole("button", { name: /^filter/i })).toBeVisible();
    await expect(toolbar.getByRole("combobox")).toBeVisible();
    await expect(toolbar.getByRole("button", { name: "Status" })).toBeVisible();
    await expect(toolbar.getByRole("button", { name: "Category" })).toBeVisible();
  });

  // ─── Filter ──────────────────────────────────────────────────────────────

  test.describe("Filter", () => {
    test.beforeEach(async ({ page }) => {
      // Ensure at least one categorised task exists for filter tests
      await addTaskWithCategory(page, `Filter Task ${Date.now()}`, "Fire Marshal");
    });

    test("Filter popover lists all 6 categories", async ({ page }) => {
      await page
        .locator('[data-testid="task-toolbar"]')
        .getByRole("button", { name: /^filter/i })
        .click();
      // Popover items have cursor-pointer + select-none; task rows do not
      for (const cat of [
        "Fire Marshal",
        "ID Sign",
        "Warehouse Manifest",
        "Show Bucket",
        "Vehicle Spotting",
        "Electrical",
      ]) {
        await expect(
          page.locator(".cursor-pointer.select-none").filter({ hasText: cat }),
        ).toBeVisible();
      }
    });

    test("selecting a category shows a count badge on the Filter button", async ({ page }) => {
      const toolbar = page.locator('[data-testid="task-toolbar"]');
      await toolbar.getByRole("button", { name: /^filter/i }).click();
      await page
        .locator(".cursor-pointer.select-none")
        .filter({ hasText: "Fire Marshal" })
        .click();
      await page.keyboard.press("Escape");
      await expect(toolbar.getByRole("button", { name: /^filter/i })).toContainText("1");
    });

    test("selecting a category shows a dismissible chip in the toolbar", async ({ page }) => {
      const toolbar = page.locator('[data-testid="task-toolbar"]');
      await toolbar.getByRole("button", { name: /^filter/i }).click();
      await page
        .locator(".cursor-pointer.select-none")
        .filter({ hasText: "Fire Marshal" })
        .click();
      await page.keyboard.press("Escape");
      // Chip is a cursor-pointer element inside the toolbar containing the category name
      await expect(
        toolbar.locator('[class*="cursor-pointer"]').filter({ hasText: "Fire Marshal" }).first(),
      ).toBeVisible();
    });

    test("clicking a chip removes that filter", async ({ page }) => {
      const toolbar = page.locator('[data-testid="task-toolbar"]');
      await toolbar.getByRole("button", { name: /^filter/i }).click();
      await page
        .locator(".cursor-pointer.select-none")
        .filter({ hasText: "Fire Marshal" })
        .click();
      await page.keyboard.press("Escape");
      // Click the chip to dismiss it
      await toolbar
        .locator('[class*="cursor-pointer"]')
        .filter({ hasText: "Fire Marshal" })
        .first()
        .click();
      await expect(toolbar.getByRole("button", { name: /^filter/i })).not.toContainText("1");
    });

    test("Clear all removes all active filters at once", async ({ page }) => {
      const toolbar = page.locator('[data-testid="task-toolbar"]');
      await toolbar.getByRole("button", { name: /^filter/i }).click();
      await page
        .locator(".cursor-pointer.select-none")
        .filter({ hasText: "Fire Marshal" })
        .click();
      await page
        .locator(".cursor-pointer.select-none")
        .filter({ hasText: "ID Sign" })
        .click();
      await page.getByRole("button", { name: /clear all/i }).click();
      await page.keyboard.press("Escape");
      await expect(toolbar.getByRole("button", { name: /^filter/i })).not.toContainText("2");
    });

    test("active filter hides tasks whose category does not match", async ({ page }) => {
      const electricalName = `Non-FM Task ${Date.now()}`;
      await addTaskWithCategory(page, electricalName, "Electrical");
      const toolbar = page.locator('[data-testid="task-toolbar"]');
      await toolbar.getByRole("button", { name: /^filter/i }).click();
      await page
        .locator(".cursor-pointer.select-none")
        .filter({ hasText: "Fire Marshal" })
        .click();
      await page.keyboard.press("Escape");
      // The Electrical task (unique name) should no longer be visible
      await expect(page.getByText(electricalName)).not.toBeVisible();
    });
  });

  // ─── Sort ─────────────────────────────────────────────────────────────────

  test("sort dropdown has all 4 options", async ({ page }) => {
    await addTaskWithCategory(page, `Sort Test ${Date.now()}`, "Show Bucket");
    const toolbar = page.locator('[data-testid="task-toolbar"]');
    await toolbar.getByRole("combobox").click();
    await expect(page.getByRole("option", { name: "Due Date ↑" })).toBeVisible();
    await expect(page.getByRole("option", { name: "Due Date ↓" })).toBeVisible();
    await expect(page.getByRole("option", { name: "Name A→Z" })).toBeVisible();
    await expect(page.getByRole("option", { name: "Category" })).toBeVisible();
  });

  test("changing sort to Name A→Z rerenders without error", async ({ page }) => {
    await addTaskWithCategory(page, `Sort Name Test ${Date.now()}`, "ID Sign");
    const toolbar = page.locator('[data-testid="task-toolbar"]');
    await toolbar.getByRole("combobox").click();
    await page.getByRole("option", { name: "Name A→Z" }).click();
    await expect(page.locator('[role="checkbox"]').first()).toBeVisible();
  });

  // ─── Group ────────────────────────────────────────────────────────────────

  test("Status is the active group mode by default", async ({ page }) => {
    await addTaskWithCategory(page, `Group Default ${Date.now()}`, "Electrical");
    const toolbar = page.locator('[data-testid="task-toolbar"]');
    await expect(toolbar.getByRole("button", { name: "Status" })).toHaveClass(/bg-primary/);
    await expect(toolbar.getByRole("button", { name: "Category" })).not.toHaveClass(/bg-primary/);
  });

  test("switching to Category mode activates the Category button", async ({ page }) => {
    await addTaskWithCategory(page, `Cat Mode ${Date.now()}`, "Electrical");
    const toolbar = page.locator('[data-testid="task-toolbar"]');
    await toolbar.getByRole("button", { name: "Category" }).click();
    await expect(toolbar.getByRole("button", { name: "Category" })).toHaveClass(/bg-primary/);
    await expect(toolbar.getByRole("button", { name: "Status" })).not.toHaveClass(/bg-primary/);
  });

  test("Category mode shows a collapsible section for each task's category", async ({ page }) => {
    const taskName = `Section Task ${Date.now()}`;
    await addTaskWithCategory(page, taskName, "Electrical");
    const toolbar = page.locator('[data-testid="task-toolbar"]');
    await toolbar.getByRole("button", { name: "Category" }).click();
    // The "Electrical" section header should appear
    await expect(
      page
        .locator(".font-semibold.uppercase.tracking-wider")
        .filter({ hasText: "Electrical" })
        .first(),
    ).toBeVisible();
    // The task itself should be visible inside the section
    await expect(page.getByText(taskName)).toBeVisible();
  });

  test("category sections start expanded and collapse on button click", async ({ page }) => {
    const taskName = `Collapse Task ${Date.now()}`;
    await addTaskWithCategory(page, taskName, "Fire Marshal");
    const toolbar = page.locator('[data-testid="task-toolbar"]');
    await toolbar.getByRole("button", { name: "Category" }).click();
    // Confirm task is visible while section is open
    await expect(page.getByText(taskName)).toBeVisible();
    // Click the collapse button in the Fire Marshal section header
    const sectionHeader = page
      .locator(".flex.items-center.justify-between")
      .filter({ hasText: "Fire Marshal" })
      .first();
    await sectionHeader.getByRole("button").click();
    await page.waitForTimeout(300); // collapse animation
    await expect(page.getByText(taskName)).not.toBeVisible();
  });

  test("switching back to Status restores Status as the active mode", async ({ page }) => {
    await addTaskWithCategory(page, `Back To Status ${Date.now()}`, "ID Sign");
    const toolbar = page.locator('[data-testid="task-toolbar"]');
    await toolbar.getByRole("button", { name: "Category" }).click();
    await toolbar.getByRole("button", { name: "Status" }).click();
    await expect(toolbar.getByRole("button", { name: "Status" })).toHaveClass(/bg-primary/);
    await expect(toolbar.getByRole("button", { name: "Category" })).not.toHaveClass(/bg-primary/);
  });
});
