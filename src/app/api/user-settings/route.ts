import { NextResponse, type NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { z } from "zod/v3"
import { usernameField } from "@/server/auth/schemas"
import { PUBLIC_LOCALES, type Locale } from "@/i18n/routing"
import { EMAIL_CHANGE_CALLBACK, localizedCallback } from "@/lib/auth/paths"
import { requestLocale } from "@/server/i18n"
import { approveChangeToTakenEmail } from "@/server/auth/auth"
import { identityRequest, refuseCrossSite } from "@/server/auth/identity"
import { getDb } from "@/server/db/client"
import { profiles, users } from "@/server/db/schema"
import { updateProfile, usernameTaken, UsernameTakenError } from "@/server/services/users"
import { apiError } from "@/server/api-error"

const changes = z
  .object({
    fullName: z.string().trim().min(1, "Enter a name").max(100),
    username: usernameField,
    email: z.string().trim().email("Enter a valid email").max(320),
    /** The language they picked (#182): a public one, so a language still being written can't be saved. */
    locale: z.string().refine((l): l is Locale => (PUBLIC_LOCALES as readonly string[]).includes(l), "Pick a language PokeFindr offers"),
  })
  .partial()
  .strict()

/** The signed-in user's name, username and email (middleware sets x-user-id). */
export async function GET(req: NextRequest) {
  const userId = req.headers.get("x-user-id")
  if (!userId) return apiError("loginRequired", "Unauthenticated", 401)
  const [row] = await getDb()
    .select({ fullName: profiles.fullName, username: profiles.username, email: users.email, locale: profiles.locale })
    .from(profiles)
    .innerJoin(users, eq(users.id, profiles.id))
    .where(eq(profiles.id, userId))
  if (!row) return apiError("accountNotFound", "Account not found", 404)
  return NextResponse.json({ fullName: row.fullName ?? "", username: row.username, email: row.email, locale: row.locale })
}

/**
 * Changes the name or username at once. An email change only starts here:
 * the current address gets a link to approve it, then the new one a link to
 * confirm it, and the email changes after both (Better Auth's change-email).
 */
export async function PATCH(req: NextRequest) {
  const refused = refuseCrossSite(req)
  if (refused) return refused
  const userId = req.headers.get("x-user-id")
  if (!userId) return apiError("loginRequired", "Unauthenticated", 401)
  const parsed = changes.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiError("invalidInput", parsed.error.errors.map((e) => e.message).join(", "), 400)
  const { fullName, username, email, locale } = parsed.data

  // Better Auth asks the current address to approve a change only once it's confirmed:
  // without this, a stolen session could move an unconfirmed account to a new address in one step.
  if (email) {
    const [user] = await getDb().select({ emailVerified: users.emailVerified }).from(users).where(eq(users.id, userId))
    if (!user?.emailVerified)
      return apiError("emailUnconfirmed", "Confirm your current email before changing it. Logging in again sends a new link.", 403)
  }

  if (username && (await usernameTaken(username, userId))) return apiError("usernameTaken", "That username is already taken", 409)
  try {
    if (!(await updateProfile(userId, { fullName, username, locale }))) return apiError("accountNotFound", "Account not found", 404)
  } catch (err) {
    if (err instanceof UsernameTakenError) return apiError("usernameTaken", err.message, 409)
    throw err
  }

  if (email) {
    const res = await identityRequest(req, "/change-email", { newEmail: email, callbackURL: localizedCallback(EMAIL_CHANGE_CALLBACK, requestLocale(req)) })
    if (res.status === 401) return apiError("REAUTH", "Log in again to change your email.", 401)
    if (res.status === 429) return apiError("tooManyAttempts", "Too many attempts. Wait a minute and try again.", 429)
    if (!res.ok) {
      const { message } = (await res.json().catch(() => ({}))) as { message?: string }
      return message === "Email is the same"
        ? apiError("emailSame", "That's already your email.", 400)
        : apiError("emailChangeFailed", "Couldn't start the email change", 400)
    }
    // Better Auth sends no approval email for an address another account has; send the same one.
    const [current] = await getDb().select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, userId))
    if (current) await approveChangeToTakenEmail(current, email, localizedCallback(EMAIL_CHANGE_CALLBACK, requestLocale(req)))
    return NextResponse.json({ ok: true, emailPending: true })
  }
  return NextResponse.json({ ok: true })
}
