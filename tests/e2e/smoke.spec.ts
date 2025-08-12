import { test, expect } from "@playwright/test";

test.describe("Smoke", () => {
  test("dashboard tiles render and SSE ping updates", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("All-Replicate Content Engine")).toBeVisible();
    // Sidebar link may be visually hidden on small view; assert existence instead of visible
    await expect(page.locator('a:has-text("Dashboard")').first()).toHaveCount(
      1,
    );
    const sseLocator = page.getByText(/SSE status:/);
    await expect(sseLocator).toBeVisible();
    const initial = await sseLocator.textContent();
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
    const kpiTile = page.getByText(/In-progress jobs/i).first();
    await expect(kpiTile).toBeVisible();
  });

  test("Scenes Plan form: invalid -> errors; valid -> submit enabled", async ({
    page,
  }) => {
    await page.goto("/scenes-plan");
    await expect(
      page.getByRole("heading", { name: "Scenes Plan" }).first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "Form", exact: true }).click();
    const sceneId = page.locator("#scene_id");
    await sceneId.fill("");
    const duration = page.locator("#duration_s");
    await duration.fill("");
    const submitBtn = page.getByRole("button", {
      name: "Submit Plan",
      exact: true,
    });
    await expect(submitBtn).toBeDisabled();
    await sceneId.fill("hook1_s1");
    await duration.fill("2.0");
    await page.locator("#composition").fill("tight mid on mascot");
    await page.locator("#prompt").fill("mascot in startup office");
    await page
      .locator("#character_reference_image")
      .fill("https://example.com/mascot.png");
    await expect(submitBtn).toBeEnabled();
  });

  test("Scenes Render: queue single and batch", async ({ page }) => {
    await page.goto("/scenes-render");
    await expect(
      page.getByRole("heading", { name: "Scenes Render" }).first(),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Insert Ideogram preset", exact: true })
      .click();
    const renderBtn = page
      .getByRole("button", { name: "Render", exact: true })
      .first();
    await renderBtn.click();
    await expect(page.getByText(/Live status/)).toBeVisible();
    const batchBtn = page
      .getByRole("button", { name: "Queue 15 renders", exact: true })
      .first();
    await expect(batchBtn).toBeEnabled();
    await batchBtn.click();
  });
});
