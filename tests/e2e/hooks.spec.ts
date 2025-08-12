import { test, expect } from "@playwright/test";

test.describe("Hooks page", () => {
  test("Mine and Synthesize queue, filter/search, toggle approve, edit drawer, plan scenes", async ({
    page,
  }) => {
    await page.goto("/hooks");
    await expect(page.getByRole("heading", { name: "Hooks" })).toBeVisible();

    // Toolbar buttons
    const mineBtn = page.getByRole("button", { name: "Mine Hooks" }).first();
    await mineBtn.click();
    // In dialog, add a source and start
    await page.getByLabel("Handle or URL").fill("@creator");
    await page.getByRole("button", { name: "Add Source" }).click();
    await page.getByTestId("mine-start").click();
    // Toast expected; allow brief time
    await page.waitForTimeout(500);

    // Synthesize dialog
    await page.getByRole("button", { name: "Synthesize" }).first().click();
    const startSynth = page.getByTestId("synth-start");
    await expect(startSynth).toBeEnabled();
    await startSynth.click({ force: true });
    await page.waitForTimeout(500);

    // Refresh synth when enabled
    const refreshSynth = page.getByRole("button", { name: "Refresh synth" });
    await expect(refreshSynth).toBeVisible();

    // Filter chips and search
    await page.getByPlaceholder("Search caption or hook text").fill("sample");

    // Approve toggle works (if a row exists after a refresh)
    // Non-flaky: try to toggle first checkbox if present
    const approveToggle = page.locator('tbody input[type="checkbox"]').first();
    if (await approveToggle.count()) {
      const wasChecked = await approveToggle.isChecked();
      await approveToggle.click();
      await page.waitForTimeout(200);
      // reflect after refresh
      await refreshSynth.click();
      await page.waitForTimeout(200);
    }

    // Edit drawer
    const editBtn = page.getByRole("button", { name: "Edit hook" });
    if (await editBtn.count()) {
      await editBtn.first().click();
      await expect(page.getByText("Approve / Edit")).toBeVisible();
      await page.getByLabel("Hook text").fill("Edited text");
      await page.getByRole("button", { name: "Save" }).click();
      await page.waitForTimeout(300);
    }

    // Plan Scenes navigation (icon button has aria-label)
    const planBtn = page.getByRole("button", { name: "Plan scenes from hook" });
    if (await planBtn.count()) {
      await planBtn.first().click();
      await expect(page).toHaveURL(/scenes-plan/);
      await expect(
        page.getByRole("heading", { name: "Scenes Plan" }),
      ).toBeVisible();
    }
  });
});
