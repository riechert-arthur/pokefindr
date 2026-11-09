import "server-only"
import { createHmac } from "node:crypto"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { eq } from "drizzle-orm"
import { getMailer } from "@/server/container"
import { getDb } from "@/server/db/client"
import { resetPassword, verifyEmail } from "@/server/email/templates"
import type { EmailContent } from "@/server/email/templates"
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

/**
 * Sends an account email. A failure is logged, not thrown: it mustn't undo
 * the sign-up or reset that asked for it, and logging in again sends a new
 * confirmation link.
 */
async function sendAccountEmail(to: string, email: EmailContent): Promise<void> {
  try {
    await getMailer().send({ to, ...email })
  } catch (err) {
    console.error(`[auth] couldn't send "${email.subject}"`, err)
  }
}

function socialProviders(config: ServerConfig) {
  return {
    ...(config.GOOGLE_CLIENT_ID && { google: { clientId: config.GOOGLE_CLIENT_ID, clientSecret: config.GOOGLE_CLIENT_SECRET! } }),
    ...(config.DISCORD_CLIENT_ID && { discord: { clientId: config.DISCORD_CLIENT_ID, clientSecret: config.DISCORD_CLIENT_SECRET! } }),
  }
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
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 16,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: ({ user, url }) => sendAccountEmail(user.email, resetPassword({ name: user.name, url })),
      // Opening the reset link proves the address is theirs, so it counts as confirmed:
      // someone who signed up with your email and never confirmed can't keep you out.
      onPasswordReset: async ({ user }) => {
        await getDb().update(users).set({ emailVerified: true }).where(eq(users.id, user.id))
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      // A login before confirming sends a new link (the old one may have expired).
      sendOnSignIn: true,
      autoSignInAfterVerification: false,
      expiresIn: 60 * 60 * 24,
      sendVerificationEmail: ({ user, url }) => sendAccountEmail(user.email, verifyEmail({ name: user.name, url })),
    },
    // Signing in with Google or Discord links to an existing account with the same
    // email only when both sides have confirmed it (Better Auth's default).
    socialProviders: socialProviders(config),
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
