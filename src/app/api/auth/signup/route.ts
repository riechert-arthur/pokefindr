import { NextResponse, type NextRequest } from "next/server"
import { registrationSchema } from "@/server/auth/schemas"
import { VERIFIED_CALLBACK } from "@/lib/auth/paths"
import { identityRequest, refuseCrossSite } from "@/server/auth/identity"
import { requestLocale } from "@/server/i18n"
import { clearExpiredClaim, createProfile, deleteUser, holdUsername, releaseUsername, userExists, usernameTaken, UsernameTakenError } from "@/server/services/users"
import { apiError } from "@/server/api-error"

/**
 * Email sign-up. Better Auth creates the user and sends the confirmation
 * email; we add the profile (username and name). A taken email gets the
 * same answer as a new one, so the form can't be used to find accounts.
 */
export async function POST(req: NextRequest) {
  const refused = refuseCrossSite(req)
  if (refused) return refused
  const parsed = registrationSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors.map((e) => e.message).join(", ") }, { status: 400 })
  const { email, password, name } = parsed.data
  const username = parsed.data.username

  // Claimed before Better Auth runs, whether the email turns out new or taken, so the
  // username can't show which (and two sign-ups at once can't both get it).
  if (await usernameTaken(username)) return apiError("usernameTaken", "That username is already taken", 409)
  await clearExpiredClaim(username)
  if (!(await holdUsername(username))) return apiError("usernameTaken", "That username is already taken", 409)

  const res = await identityRequest(req, "/sign-up/email", { email, password, name, callbackURL: VERIFIED_CALLBACK })
  if (!res.ok) await releaseUsername(username)
  if (res.status === 429) return apiError("tooManyAttempts", "Too many attempts. Wait a minute and try again.", 429)
  if (!res.ok) {
    const { message } = ((await res.json().catch(() => ({}))) as { message?: string })
    // Better Auth's own message, in English: the page shows its own.
    return apiError("signupFailed", message ?? "Couldn't sign you up", 400)
  }

  const { user } = (await res.json()) as { user: { id: string } }
  // An email that already has an account gets a made-up user back: nothing to add.
  if (await userExists(user.id)) {
    try {
      // The language they signed up in is theirs until they pick another (#182, #185).
      await createProfile({ id: user.id, username, fullName: name, onboarded: true, locale: requestLocale(req) })
    } catch (err) {
      // Lost a race for the username: undo the account so it can be tried again.
      await deleteUser(user.id)
      if (err instanceof UsernameTakenError) return apiError("usernameTaken", err.message, 409)
      throw err
    }
  }
  return NextResponse.json({ ok: true, confirm: true })
}
