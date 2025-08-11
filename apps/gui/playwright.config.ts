import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "../../tests/e2e",
  use: {
    baseURL: process.env.GUI_BASE || "http://localhost:3001",
    actionTimeout: 5_000,
    navigationTimeout: 10_000,
    viewport: { width: 1280, height: 800 },
    headless: true,
  },
  timeout: 30_000,
  reporter: [["list"]],
  webServer: process.env.GUI_BASE
    ? undefined
    : {
        command: "npm run build && npm run start:test",
        url: "http://localhost:3001",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
