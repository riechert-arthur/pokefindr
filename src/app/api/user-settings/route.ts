import { NextResponse, type NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { usernameField } from "@/lib/schemas"
import { EMAIL_CHANGE_CALLBACK } from "@/lib/auth/paths"
import { identityRequest } from "@/server/auth/identity"
import { getDb } from "@/server/db/client"
import { profiles, users } from "@/server/db/schema"
import { updateProfile, usernameTaken, UsernameTakenError } from "@/server/services/users"

const changes = z
  .object({
    fullName: z.string().trim().min(1, "Enter a name").max(100),
    username: usernameField,
    email: z.string().trim().email("Enter a valid email").max(320),
  })
  .partial()
  .strict()

/** The signed-in user's name, username and email (middleware sets x-user-id). */
export async function GET(req: NextRequest) {
  const userId = req.headers.get("x-user-id")
  if (!userId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  const [row] = await getDb()
    .select({ fullName: profiles.fullName, username: profiles.username, email: users.email })
    .from(profiles)
    .innerJoin(users, eq(users.id, profiles.id))
    .where(eq(profiles.id, userId))
  if (!row) return NextResponse.json({ error: "Account not found" }, { status: 404 })
  return NextResponse.json({ fullName: row.fullName ?? "", username: row.username, email: row.email })
}

/**
 * Changes the name or username at once. An email change only starts here:
 * the current address gets a link to approve it, then the new one a link to
 * confirm it, and the email changes after both (Better Auth's change-email).
 */
export async function PATCH(req: NextRequest) {
  const userId = req.headers.get("x-user-id")
  if (!userId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  const parsed = changes.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors.map((e) => e.message).join(", ") }, { status: 400 })
  const { fullName, username, email } = parsed.data

  if (username && (await usernameTaken(username, userId))) return NextResponse.json({ error: "That username is already taken" }, { status: 409 })
  try {
    if (!(await updateProfile(userId, { fullName, username }))) return NextResponse.json({ error: "Account not found" }, { status: 404 })
  } catch (err) {
    if (err instanceof UsernameTakenError) return NextResponse.json({ error: err.message }, { status: 409 })
    throw err
  }

  if (email) {
    const res = await identityRequest(req, "/change-email", { newEmail: email, callbackURL: EMAIL_CHANGE_CALLBACK })
    if (res.status === 401) return NextResponse.json({ error: "Log in again to change your email.", code: "REAUTH" }, { status: 401 })
    if (res.status === 429) return NextResponse.json({ error: "Too many attempts. Wait a minute and try again." }, { status: 429 })
    if (!res.ok) {
      const { message } = (await res.json().catch(() => ({}))) as { message?: string }
      return NextResponse.json({ error: message === "Email is the same" ? "That's already your email." : "Couldn't start the email change" }, { status: 400 })
    }
    return NextResponse.json({ ok: true, emailPending: true })
  }
  return NextResponse.json({ ok: true })
}
