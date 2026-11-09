import { defineConfig, devices } from "@playwright/test"

/**
 * End-to-end tests against a running stack (`make run`): the app on
 * localhost:3000 and Mailpit on localhost:8025. CI's make run job runs them.
 *
 *   make run && npx playwright test
 */
export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  outputDir: "test-results",
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
})
