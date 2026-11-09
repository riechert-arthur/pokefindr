import { NextResponse, type NextRequest } from "next/server"
import { registrationSchema } from "@/lib/schemas"
import { VERIFIED_CALLBACK } from "@/lib/auth/paths"
import { identityRequest } from "@/server/auth/identity"
import { createProfile, deleteUser, userExists, usernameTaken, UsernameTakenError } from "@/server/services/users"

/**
 * Email sign-up. Better Auth creates the user and sends the confirmation
 * email; we add the profile (username and name). A taken email gets the
 * same answer as a new one, so the form can't be used to find accounts.
 */
export async function POST(req: NextRequest) {
  const parsed = registrationSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors.map((e) => e.message).join(", ") }, { status: 400 })
  const { email, password, name } = parsed.data
  const username = parsed.data.username.trim()

  if (await usernameTaken(username)) return NextResponse.json({ error: "That username is already taken" }, { status: 409 })

  const res = await identityRequest(req, "/sign-up/email", { email, password, name, callbackURL: VERIFIED_CALLBACK })
  if (res.status === 429) return NextResponse.json({ error: "Too many attempts. Wait a minute and try again." }, { status: 429 })
  if (!res.ok) {
    const { message } = ((await res.json().catch(() => ({}))) as { message?: string })
    return NextResponse.json({ error: message ?? "Couldn't sign you up" }, { status: 400 })
  }

  const { user } = (await res.json()) as { user: { id: string } }
  // An email that already has an account gets a made-up user back: nothing to add.
  if (await userExists(user.id)) {
    try {
      await createProfile({ id: user.id, username, fullName: name, onboarded: true })
    } catch (err) {
      // Lost a race for the username: undo the account so it can be tried again.
      await deleteUser(user.id)
      if (err instanceof UsernameTakenError) return NextResponse.json({ error: err.message }, { status: 409 })
      throw err
    }
  }
  return NextResponse.json({ ok: true, confirm: true })
}
