import { defineConfig } from "@playwright/test";
const consoleUrl = 'http://127.0.0.1:' + (process.env.PRAKARO_CONSOLE_PORT ?? 5173);
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 90000,
  use: {
    baseURL: consoleUrl,
    viewport: { width: 1440, height: 1000 },
    launchOptions: process.env.PRAKARO_TEST_BROWSER
      ? { executablePath: process.env.PRAKARO_TEST_BROWSER }
      : {},
  },
  webServer: [
    {
      command: "npm --prefix ../api run start",
      url:
        (process.env.PRAKARO_API_PROXY ?? "http://127.0.0.1:3000") + "/health",
      reuseExistingServer: true,
    },
    {
      command: "npm run dev",
      url: consoleUrl,
      reuseExistingServer: true,
    },
  ],
});
