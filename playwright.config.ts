import { defineConfig, devices } from "@playwright/test"

/**
 * End-to-end tests against a running stack (`make run`): the app on
 * localhost:3000 and Mailpit on localhost:8025. CI's make run job runs them.
 *
 *   make run && npx playwright test
 */
/**
 * Better Auth's rate limits are kept in the database and keyed by client IP,
 * so back-to-back runs from one machine would share them (3 password resets a
 * minute). Each run claims its own address: with no proxy in front, the app
 * takes the address headers as sent.
 */
const runIp = `10.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 254) + 1}`

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  // A test.only left in by mistake would let CI pass while skipping the rest.
  forbidOnly: Boolean(process.env.CI),
  workers: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    // Both: our routes read x-real-ip, and Better Auth's own endpoints (the forgot-password form) x-forwarded-for.
    extraHTTPHeaders: { "x-real-ip": runIp, "x-forwarded-for": runIp },
  },
  outputDir: "test-results",
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
})
