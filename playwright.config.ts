import { defineConfig, devices } from "@playwright/test";

// Browser tests. Two copies of the dashboard run side by side:
//  - demo:   no credentials, built-in demo data (port 53121)
//  - github: GitHub mode against the fake GitHub API in e2e/fake-github-server.mjs (port 53122),
//            signed in as "owner" through STAGEDIRECTOR_DEV_LOGIN (dev builds only).
const FAKE = "http://127.0.0.1:53190";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1, // both apps keep state in memory; tests run in order
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "demo", testMatch: /demo\..*spec\.ts/, use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:53121" } },
    { name: "demo-phone", testMatch: /phone\..*spec\.ts/, use: { ...devices["Pixel 7"], baseURL: "http://localhost:53121" } },
    { name: "github", testMatch: /github\..*spec\.ts/, use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:53122" } },
  ],
  webServer: [
    {
      command: "npx next dev -p 53121",
      url: "http://localhost:53121/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { GITHUB_TOKEN: "", GITHUB_APP_ID: "", STAGEDIRECTOR_REPOS: "", NEXT_DIST_DIR: ".next-e2e-demo" },
    },
    { command: "node e2e/fake-github-server.mjs", url: `${FAKE}/repos/acme/site`, reuseExistingServer: !process.env.CI },
    {
      command: "npx next dev -p 53122",
      url: "http://localhost:53122/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        GITHUB_TOKEN: "fake-token",
        GITHUB_API_URL: FAKE,
        STAGEDIRECTOR_REPOS: "acme/site",
        STAGEDIRECTOR_DEV_LOGIN: "owner",
        NEXT_DIST_DIR: ".next-e2e-github",
      },
    },
  ],
});
