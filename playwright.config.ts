import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";
process.env.AGENDA_E2E_RUN ??= String(Date.now());
const db = (name: string) =>
  resolve(
    "work",
    "browser-" + process.env.AGENDA_E2E_RUN + "-" + name + ".sqlite",
  );
export default defineConfig({
  testDir: "tests/browser",
  workers: 1,
  timeout: 45000,
  globalSetup: "./tests/browser/setup.ts",
  use: { channel: "msedge", trace: "retain-on-failure" },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Edge"], baseURL: "http://localhost:5195" },
    },
    {
      name: "mobile",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        baseURL: "http://localhost:5196",
      },
    },
  ],
  webServer: [
    {
      command: "node scripts/server.mjs start",
      env: {
        PORT: "5195",
        APP_URL: "http://localhost:5195",
        SQLITE_PATH: db("desktop"),
        DATABASE_URL: "",
      },
      url: "http://localhost:5195/api/health",
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      command: "node scripts/server.mjs start",
      env: {
        PORT: "5196",
        APP_URL: "http://localhost:5196",
        SQLITE_PATH: db("mobile"),
        DATABASE_URL: "",
      },
      url: "http://localhost:5196/api/health",
      reuseExistingServer: false,
      timeout: 60000,
    },
  ],
});
