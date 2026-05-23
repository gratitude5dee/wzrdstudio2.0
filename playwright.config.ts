import { defineConfig, devices } from "@playwright/test";

const port = process.env.PLAYWRIGHT_PORT || "8080";
const localBaseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || localBaseURL,
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: `VITE_USE_MOCK_ASSETS=true VITE_BYPASS_AUTH_FOR_TESTS=true npm run dev -- --host 127.0.0.1 --port ${port}`,
    url: localBaseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
