import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import tsconfigPaths from "vite-tsconfig-paths"

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    setupFiles: "./vitest.setup.ts",
    // Integration tests need Postgres; run them with `npm run test:integration`.
    exclude: ["**/node_modules/**", "__tests__/integration/**"],
  },
})
