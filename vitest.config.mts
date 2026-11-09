import { configDefaults, defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import tsconfigPaths from "vite-tsconfig-paths"
import { buildMessages } from "./scripts/i18n/build.mjs"

// The tests read the same catalogs as the app (docs/i18n.md).
buildMessages()

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    setupFiles: "./vitest.setup.ts",
    // Integration tests need Postgres; run them with `npm run test:integration`.
    exclude: [...configDefaults.exclude, "__tests__/integration/**"],
    // next-intl imports "next/server" without an extension, which only a
    // bundler resolves, so Vite processes it instead of Node loading it.
    server: { deps: { inline: ["next-intl"] } },
  },
})
