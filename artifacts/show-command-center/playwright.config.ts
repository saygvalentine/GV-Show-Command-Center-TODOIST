import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    // All traffic must go through the shared proxy at port 80 so that
    // /api routes are forwarded to the API server automatically.
    baseURL: "http://localhost:80",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          executablePath:
            "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium",
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        },
      },
    },
  ],
  // The app is already running via a workflow; just verify the proxy is up.
  webServer: {
    command: "echo 'server already running'",
    url: "http://localhost:80",
    reuseExistingServer: true,
    timeout: 10_000,
  },
});
