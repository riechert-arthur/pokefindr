import { afterAll, beforeEach, vi } from "vitest"
import { closeTestConnection, testDatabaseUrl, truncateAll } from "./testDatabase"

vi.mock("server-only", () => ({}))
// revalidateTag needs a Next.js request context; tests only care that it was called.
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}))

process.env.DATABASE_URL = testDatabaseUrl()
process.env.APP_URL ??= "http://localhost:3000"
process.env.JWT_SECRET ??= "integration-test-secret"

beforeEach(async () => {
  await truncateAll()
})

afterAll(async () => {
  const { closeDb } = await import("@/server/db/client")
  await closeDb()
  await closeTestConnection()
})
