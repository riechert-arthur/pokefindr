import { defineConfig } from "vitest/config"
import tsconfigPaths from "vite-tsconfig-paths"
import { buildMessages } from "./scripts/i18n/build.mjs"

buildMessages()

// Integration tests run against a real Postgres + PostGIS.
// Locally: `npm run db:up && npm run test:integration`.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["__tests__/integration/**/*.test.ts"],
    globalSetup: "./__tests__/integration/globalSetup.ts",
    setupFiles: "./__tests__/integration/setup.ts",
    // Tests share one database; run files one at a time.
    fileParallelism: false,
    testTimeout: 20_000,
    server: { deps: { inline: ["next-intl"] } },
    hookTimeout: 60_000,
  },
})
