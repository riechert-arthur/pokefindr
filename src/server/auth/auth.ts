import "server-only"
import { createHmac } from "node:crypto"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { eq } from "drizzle-orm"
import { after } from "next/server"
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

const pending = new Set<Promise<unknown>>()

/**
 * Better Auth's background tasks (its emails): they finish after the
 * response, so a request that sends an email answers as fast as one that
 * doesn't, and the timing can't tell whether an address has an account.
 */
function runInBackground(task: Promise<unknown>) {
  const tracked = task.catch((err) => console.error("[auth] background task failed", err)).finally(() => pending.delete(tracked))
  pending.add(tracked)
  try {
    after(tracked)
  } catch {
    // Outside a request (tests, scripts): it still runs.
  }
}

/** Test helper: wait for the emails requests so far have started sending. */
export async function settleBackgroundForTests() {
  await Promise.all(pending)
}

/**
 * Whether Better Auth may create this user. An unconfirmed email is only
 * allowed from our email sign-up, which confirms it next. From Google or
 * Discord it's refused: Discord lets people sign in with an address it
 * hasn't checked, so someone could take your email, and keep their
 * Discord login on the account after you reset its password.
 */
export function mayCreateUser(user: { emailVerified: boolean }, endpoint: { path: string } | null): boolean {
  return user.emailVerified || !endpoint || endpoint.path === "/sign-up/email"
}

/**
 * Swaps an email the provider hasn't confirmed for one that matches no
 * account, before Better Auth looks it up. A sign-in then fails the same way
 * whether or not the real address has an account here (the create hook
 * refuses it), while someone whose provider account is already linked is
 * found by that link and still gets in. Better Auth doesn't save it.
 */
const onlyConfirmedEmail = (confirmed: boolean | undefined, providerUserId: string) =>
  confirmed ? {} : { email: `${providerUserId}@unconfirmed.invalid` }

function socialProviders(config: ServerConfig) {
  return {
    ...(config.GOOGLE_CLIENT_ID && {
      google: {
        clientId: config.GOOGLE_CLIENT_ID,
        clientSecret: config.GOOGLE_CLIENT_SECRET!,
        mapProfileToUser: (profile: { sub: string; email_verified?: boolean }) => onlyConfirmedEmail(profile.email_verified, `google-${profile.sub}`),
      },
    }),
    ...(config.DISCORD_CLIENT_ID && {
      discord: {
        clientId: config.DISCORD_CLIENT_ID,
        clientSecret: config.DISCORD_CLIENT_SECRET!,
        mapProfileToUser: (profile: { id: string; verified?: boolean }) => onlyConfirmedEmail(profile.verified, `discord-${profile.id}`),
      },
    }),
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
    advanced: {
      database: { generateId: "uuid" },
      useSecureCookies: config.NODE_ENV === "production",
      backgroundTasks: { handler: runInBackground },
    },
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
    databaseHooks: { user: { create: { before: async (user, endpoint) => (mayCreateUser(user, endpoint) ? undefined : false) } } },
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
