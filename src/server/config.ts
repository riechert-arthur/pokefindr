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
/** Treats an empty variable (`FOO=`) as unset, so its default or optionality applies. */
const blankAsUnset = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema)

const serverSchema = z.object({
  // Only compared to "production", so any other value (e.g. "staging") is allowed.
  NODE_ENV: z.string().default("development"),

  /** Public base URL of the app, used to build links in emails and OAuth redirects. */
  APP_URL: z.string().url(),

  /** Secret used to sign the `app_session` cookie. */
  JWT_SECRET: z.string().min(1),

  /**
   * Pooled Postgres connection string used at runtime. Postgres 15+ with PostGIS.
   * Optional until request handlers use the database, so deploys don't fail at
   * start-up before it is configured. `getDb()` throws if it is missing.
   */
  DATABASE_URL: blankAsUnset(z.string().url().optional()),
  /** Max connections per server instance. Keep small on serverless hosts. */
  DATABASE_POOL_MAX: blankAsUnset(z.coerce.number().int().positive().default(5)),

  /**
   * Shared secret for `/api/jobs/<name>` (Vercel Cron sends it as
   * `Authorization: Bearer <CRON_SECRET>`) and the key queue messages are
   * signed with. Optional: without it, every job request and queue message is
   * rejected. 16 characters is Vercel's own minimum; use a long random value
   * (`openssl rand -base64 48`).
   */
  CRON_SECRET: blankAsUnset(z.string().min(16, "must be at least 16 characters").optional()),
  /** Set to "1" by Vercel on its build and runtime. Decides whether jobs go through Vercel Queues. */
  VERCEL: blankAsUnset(z.string().optional()),

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
