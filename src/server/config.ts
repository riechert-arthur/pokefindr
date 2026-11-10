import "server-only"
import { z } from "zod/v3"

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

export const GEOCODER_PROVIDERS = ["fake", "photon", "mapbox", "maptiler", "nominatim"] as const
export const ROUTER_PROVIDERS = ["fake", "openrouteservice"] as const

const serverSchema = z.object({
  // Only compared to "production", so any other value (e.g. "staging") is allowed.
  NODE_ENV: z.string().default("development"),

  /** Public base URL of the app, used to build links in emails and OAuth redirects. */
  APP_URL: z.string().url(),

  /** Secret used to sign the `app_session` cookie. */
  JWT_SECRET: z.string().min(1),

  /**
   * Better Auth's signing secret (src/server/auth/auth.ts), at least 32
   * characters. Unset, it's derived from JWT_SECRET.
   */
  BETTER_AUTH_SECRET: blankAsUnset(z.string().min(32, "must be at least 32 characters").optional()),
  /**
   * OAuth sign-in. A provider is offered when both its id and secret are
   * set. Each provider's console must list the redirect URI
   * `${APP_URL}/api/identity/callback/<google|discord>`.
   */
  GOOGLE_CLIENT_ID: blankAsUnset(z.string().min(1).optional()),
  GOOGLE_CLIENT_SECRET: blankAsUnset(z.string().min(1).optional()),
  DISCORD_CLIENT_ID: blankAsUnset(z.string().min(1).optional()),
  DISCORD_CLIENT_SECRET: blankAsUnset(z.string().min(1).optional()),
  /** Better Auth's public URL. Defaults to APP_URL. */
  BETTER_AUTH_URL: blankAsUnset(z.string().url().optional()),

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

  /**
   * Which geocoder answers the search box (src/server/container.ts). Unset,
   * production uses `photon` (free, no key, built for type-ahead) and
   * everything else `fake`, which knows a handful of cities: tests, CI and
   * local dev work with no account.
   */
  GEOCODER_PROVIDER: blankAsUnset(z.enum(GEOCODER_PROVIDERS).optional()),
  /** Required for mapbox and maptiler. */
  GEOCODER_API_KEY: blankAsUnset(z.string().min(1).optional()),
  /** Required for nominatim: its usage policy asks for a User-Agent naming the app and a contact. */
  GEOCODER_USER_AGENT: blankAsUnset(z.string().min(1).optional()),
  /** A self-hosted instance instead of the provider's public one (photon, nominatim). */
  GEOCODER_BASE_URL: blankAsUnset(z.string().url().optional()),

  /**
   * Which router draws an assistant route along the streets (#288,
   * /api/route). Unset, it's `openrouteservice` when ROUTER_API_KEY is set
   * and `fake` (straight lines) otherwise, so dev and CI need no account.
   */
  ROUTER_PROVIDER: blankAsUnset(z.enum(ROUTER_PROVIDERS).optional()),
  /** OpenRouteService's API key (HeiGIT). Required for openrouteservice; stays on the server. */
  ROUTER_API_KEY: blankAsUnset(z.string().min(1).optional()),
  /** A self-hosted OpenRouteService instead of api.heigit.org/openrouteservice. */
  ROUTER_BASE_URL: blankAsUnset(z.string().url().optional()),
  /**
   * The most routes asked of the provider in any 24 hours, over the whole
   * server. Past it, /api/route draws straight lines. Keep it under the
   * provider's free quota (OpenRouteService: 2,000 a day).
   */
  ROUTER_DAILY_CAP: blankAsUnset(z.coerce.number().int().min(2).default(1800)),

  /**
   * How email is sent (src/server/container.ts): "console" prints it (local
   * dev and CI, and it refuses to run in production), "smtp" sends it
   * through SMTP_URL.
   */
  MAIL_PROVIDER: blankAsUnset(z.enum(["console", "smtp"]).default("console")),
  /**
   * Where API rate limits keep their buckets (#199): "postgres", shared by
   * every instance, or "memory", per instance. Postgres in production.
   */
  RATE_LIMIT_STORE: blankAsUnset(z.enum(["postgres", "memory"]).optional()),
  /** e.g. smtps://user:pass@smtp.example.com:465. Required when MAIL_PROVIDER is smtp. */
  SMTP_URL: blankAsUnset(z.string().url().optional()),
  /**
   * The From address. Its domain needs SPF and DKIM records with the SMTP
   * provider. Required to send in production (providers reject the
   * localhost default); elsewhere it defaults to one.
   */
  MAIL_FROM: blankAsUnset(z.string().min(1).optional()),

  /** Claude API key for the assistant (/api/assistant). Unset (and no federation below), the assistant says it's unavailable. */
  ANTHROPIC_API_KEY: blankAsUnset(z.string().min(1).optional()),

  /**
   * Workload identity federation (#226): with a rule and an organization, the
   * assistant authenticates with short-lived tokens exchanged for this
   * platform's OIDC identity (Vercel, or GitHub Actions for the evals)
   * instead of ANTHROPIC_API_KEY. None of these are secrets.
   */
  ANTHROPIC_FEDERATION_RULE_ID: blankAsUnset(z.string().startsWith("fdrl_").optional()),
  ANTHROPIC_ORGANIZATION_ID: blankAsUnset(z.string().min(1).optional()),
  /** The rule's target service account, when the rule needs it named. */
  ANTHROPIC_SERVICE_ACCOUNT_ID: blankAsUnset(z.string().startsWith("svac_").optional()),
  /** The workspace to scope tokens to, when the rule covers more than one. */
  ANTHROPIC_WORKSPACE_ID: blankAsUnset(z.string().min(1).optional()),
  /** Where the identity token comes from. Unset: Vercel on Vercel, GitHub Actions in a workflow. */
  ANTHROPIC_IDENTITY_SOURCE: blankAsUnset(z.enum(["vercel", "github-actions"]).optional()),
  /** The audience asked for in a GitHub Actions identity token (the federation rule must accept it). */
  ANTHROPIC_IDENTITY_AUDIENCE: blankAsUnset(z.string().min(1).optional()),
  /** Set by GitHub Actions in jobs with `id-token: write`. */
  ACTIONS_ID_TOKEN_REQUEST_URL: blankAsUnset(z.string().url().optional()),
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: blankAsUnset(z.string().min(1).optional()),
  /** The assistant's model. */
  ASSISTANT_MODEL: blankAsUnset(z.string().min(1).default("claude-opus-5-5")),
  /** How hard the model thinks: more is slower and costs more. */
  ASSISTANT_EFFORT: blankAsUnset(z.enum(["low", "medium", "high", "xhigh", "max"]).default("medium")),
  /** The kill switch: "false" pauses the assistant everywhere, without a deploy of new code. */
  ASSISTANT_ENABLED: blankAsUnset(z.enum(["true", "false"]).default("true")).transform((v) => v === "true"),
  /** The most the assistant may spend a UTC day, over all users, in dollars. Past it, it pauses until midnight UTC. */
  ASSISTANT_DAILY_BUDGET_USD: blankAsUnset(z.coerce.number().positive().default(10)),
}).transform((env, ctx) => {
  if (env.NODE_ENV === "production" && env.MAIL_PROVIDER === "smtp" && !env.MAIL_FROM)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["MAIL_FROM"], message: "required to send email in production" })
  return {
    ...env,
    GEOCODER_PROVIDER: env.GEOCODER_PROVIDER ?? (env.NODE_ENV === "production" ? "photon" : "fake"),
    ROUTER_PROVIDER: env.ROUTER_PROVIDER ?? (env.ROUTER_API_KEY ? "openrouteservice" : "fake"),
    RATE_LIMIT_STORE: env.RATE_LIMIT_STORE ?? (env.NODE_ENV === "production" ? "postgres" : "memory"),
    MAIL_FROM: env.MAIL_FROM ?? "PokeFindr <no-reply@localhost>",
  }
}).superRefine((env, ctx) => {
  if ((env.GEOCODER_PROVIDER === "mapbox" || env.GEOCODER_PROVIDER === "maptiler") && !env.GEOCODER_API_KEY)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["GEOCODER_API_KEY"], message: `required when GEOCODER_PROVIDER is ${env.GEOCODER_PROVIDER}` })
  if (env.ROUTER_PROVIDER === "openrouteservice" && !env.ROUTER_API_KEY)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["ROUTER_API_KEY"], message: "required when ROUTER_PROVIDER is openrouteservice" })
  if (Boolean(env.ANTHROPIC_FEDERATION_RULE_ID) !== Boolean(env.ANTHROPIC_ORGANIZATION_ID))
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [env.ANTHROPIC_FEDERATION_RULE_ID ? "ANTHROPIC_ORGANIZATION_ID" : "ANTHROPIC_FEDERATION_RULE_ID"],
      message: "workload identity federation needs both ANTHROPIC_FEDERATION_RULE_ID and ANTHROPIC_ORGANIZATION_ID",
    })
  for (const p of ["GOOGLE", "DISCORD"] as const)
    if (Boolean(env[`${p}_CLIENT_ID`]) !== Boolean(env[`${p}_CLIENT_SECRET`]))
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [`${p}_CLIENT_${env[`${p}_CLIENT_ID`] ? "SECRET" : "ID"}`], message: `${p.toLowerCase()} sign-in needs both ${p}_CLIENT_ID and ${p}_CLIENT_SECRET` })
  if (env.MAIL_PROVIDER === "smtp" && !env.SMTP_URL)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["SMTP_URL"], message: "required when MAIL_PROVIDER is smtp" })
  if (env.GEOCODER_PROVIDER === "nominatim" && !env.GEOCODER_USER_AGENT)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["GEOCODER_USER_AGENT"], message: "required when GEOCODER_PROVIDER is nominatim" })
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
