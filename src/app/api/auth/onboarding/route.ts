import { NextResponse, type NextRequest } from "next/server"
import { callbackSchema } from "@/lib/schemas"
import { identitySession, signedIn } from "@/server/auth/finish"
import { createProfile, getProfile, usernameTaken, UsernameTakenError } from "@/server/services/users"

/** A new OAuth user picks a username: creates their profile, then signs them in. */
export async function POST(req: NextRequest) {
  const parsed = callbackSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors.map((e) => e.message).join(", ") }, { status: 422 })

  const session = await identitySession(req.headers)
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  if (await getProfile(session.user.id)) return signedIn(session.user)

  const { username } = parsed.data
  if (await usernameTaken(username)) return NextResponse.json({ error: "That username is already taken" }, { status: 409 })
  try {
    await createProfile({ id: session.user.id, username, fullName: session.user.name || null, onboarded: true })
  } catch (err) {
    if (err instanceof UsernameTakenError) return NextResponse.json({ error: err.message }, { status: 409 })
    throw err
  }
  return signedIn(session.user)
}
