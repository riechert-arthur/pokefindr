import "server-only"
import { z } from "zod"

/**
 * Server-side configuration. This is the only module that should read
 * server secrets from `process.env` (enforced by ESLint).
 *
 * Parsing is lazy so `next build` can import route modules without a full
 * environment, and `instrumentation.ts` calls `getServerConfig()` at boot so a
 * misconfigured server fails on start-up instead of on the first request.
 */
const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  /** Public base URL of the app, used to build links in emails and OAuth redirects. */
  APP_URL: z.string().url(),

  /** Secret used to sign the `app_session` cookie. */
  JWT_SECRET: z.string().min(1),

  // Supabase is still used for auth until the auth migration lands.
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
})

export type ServerConfig = z.infer<typeof serverSchema>

let cached: ServerConfig | undefined

export function getServerConfig(): ServerConfig {
  if (cached) return cached

  const parsed = serverSchema.safeParse(process.env)
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n")
    throw new Error(`Invalid server configuration:\n${problems}`)
  }

  cached = parsed.data
  return cached
}

/** Test helper: forget the cached config so the next call re-reads `process.env`. */
export function resetServerConfigForTests() {
  cached = undefined
}
