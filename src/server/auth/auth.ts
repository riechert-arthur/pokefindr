import "server-only"
import { createHmac } from "node:crypto"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { getDb } from "@/server/db/client"
import { accounts, authRateLimits, sessions, users, verifications } from "@/server/db/schema"
import { getServerConfig, type ServerConfig } from "@/server/config"

/** Where Better Auth's own endpoints live. Not /api/auth, which holds our routes (login, signup, ...). */
export const IDENTITY_BASE_PATH = "/api/identity"

/**
 * Better Auth's signing secret: BETTER_AUTH_SECRET, or one derived from
 * JWT_SECRET, so an existing .env.local keeps working. The two secrets
 * still differ, and neither reveals the other.
 */
export function identitySecret(config: Pick<ServerConfig, "BETTER_AUTH_SECRET" | "JWT_SECRET">): string {
  return config.BETTER_AUTH_SECRET ?? createHmac("sha256", config.JWT_SECRET).update("pokefindr:better-auth").digest("base64url")
}

function makeAuth(config: ServerConfig) {
  return betterAuth({
    appName: "PokeFindr",
    baseURL: config.BETTER_AUTH_URL ?? config.APP_URL,
    basePath: IDENTITY_BASE_PATH,
    secret: identitySecret(config),
    trustedOrigins: [config.APP_URL],
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: { user: users, session: sessions, account: accounts, verification: verifications, rateLimit: authRateLimits },
    }),
    // Ids are UUIDs, made by Postgres, so they match profiles.id.
    advanced: { database: { generateId: "uuid" }, useSecureCookies: config.NODE_ENV === "production" },
    emailAndPassword: { enabled: true, requireEmailVerification: true, minPasswordLength: 16, maxPasswordLength: 128 },
    session: { expiresIn: 60 * 60 * 24 * 7 },
    // In the database, so limits hold across serverless instances. On everywhere but tests.
    rateLimit: { enabled: config.NODE_ENV !== "test", storage: "database", window: 60, max: 100 },
  })
}

export type Auth = ReturnType<typeof makeAuth>

let auth: Auth | undefined

/** The Better Auth instance, built on first use (config is read lazily, so `next build` needs no env). */
export function getAuth(): Auth {
  auth ??= makeAuth(getServerConfig())
  return auth
}

/** Test helper: rebuild from the current config on next use. */
export function resetAuthForTests() {
  auth = undefined
}
