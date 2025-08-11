import { defineConfig } from "@playwright/test";

export default defineConfig({
  use: {
    baseURL: process.env.GUI_BASE || "http://localhost:3000",
    actionTimeout: 5_000,
    navigationTimeout: 10_000,
    viewport: { width: 1280, height: 800 },
    headless: true,
  },
  timeout: 30_000,
  reporter: [["list"]],
});
