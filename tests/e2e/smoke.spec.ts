import { test, expect } from "@playwright/test";

const GUI_BASE = process.env.GUI_BASE || "http://localhost:3000";

test.describe("Smoke", () => {
  test("dashboard tiles render and SSE ping updates", async ({ page }) => {
    await page.goto(GUI_BASE);
    await expect(page.getByText("All-Replicate Content Engine")).toBeVisible();
    await expect(page.getByText("Dashboard")).toBeVisible();
    const sseLocator = page.getByText(/SSE status:/);
    await expect(sseLocator).toBeVisible();
    // Within 5s, ping should update
    const initial = await sseLocator.textContent();
    // retry up to ~6s to observe change
    let changed = false;
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(1000);
      const after = await sseLocator.textContent();
      if (initial !== after) {
        changed = true;
        break;
      }
    }
    expect(changed).toBeTruthy();

    // KPI tile should update after a synthetic job event (if available); otherwise, assert tile presence
    const kpiTile = page.getByText(/In-progress jobs/i);
    await expect(kpiTile).toBeVisible();
  });

  test("Scenes Plan form: invalid -> errors; valid -> submit enabled", async ({
    page,
  }) => {
    await page.goto(`${GUI_BASE}/scenes-plan`);
    await expect(
      page.getByRole("heading", { name: "Scenes Plan" }),
    ).toBeVisible();
    // Switch to Form tab
    await page.getByRole("button", { name: "Form" }).click();
    // Clear required fields to trigger errors
    const sceneId = page.locator("#scene_id");
    await sceneId.fill("");
    const duration = page.locator("#duration_s");
    await duration.fill("");
    // Submit should be disabled
    const submitBtn = page.getByRole("button", { name: "Submit Plan" });
    await expect(submitBtn).toBeDisabled();
    // Fill minimal valid fields
    await sceneId.fill("hook1_s1");
    await duration.fill("2.0");
    await page.locator("#composition").fill("tight mid on mascot");
    await page.locator("#prompt").fill("mascot in startup office");
    await page
      .locator("#character_reference_image")
      .fill("https://example.com/mascot.png");
    // Submit should be enabled
    await expect(submitBtn).toBeEnabled();
  });

  test("Scenes Render: queue single and batch", async ({ page }) => {
    await page.goto(`${GUI_BASE}/scenes-render`);
    await expect(
      page.getByRole("heading", { name: "Scenes Render" }),
    ).toBeVisible();
    // Insert preset, render
    await page.getByRole("button", { name: "Insert Ideogram preset" }).click();
    const renderBtn = page.getByRole("button", { name: "Render" });
    await renderBtn.click();
    // Toast could appear; just assert Outputs section exists eventually or Live status present
    await expect(page.getByText(/Live status/)).toBeVisible();
    // Queue batch
    const batchBtn = page.getByRole("button", { name: "Queue 15 renders" });
    await expect(batchBtn).toBeEnabled();
    await batchBtn.click();
  });
});
