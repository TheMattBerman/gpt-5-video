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
});
