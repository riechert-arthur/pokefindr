import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { registrationSchema } from '@/lib/schemas'
import { signUpNewUser } from '@/lib/supabase/auth'
import { UsernameTakenError, updateProfile } from '@/server/services/users'

export async function POST(req: NextRequest) {
  const parsed = registrationSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors.map(e => e.message).join(', ') },
      { status: 400 }
    )
  }
  const values = parsed.data

  const { data, error: upError } = await signUpNewUser(values)
  if (upError) {
    return NextResponse.json({ error: upError.message }, { status: 400 })
  }
  if (!data.user) {
    return NextResponse.json({ error: "No user id" }, { status: 404 })
  }

  // The profile row is created by a database trigger when Supabase Auth
  // creates the user; fill in the names the user chose.
  try {
    await updateProfile(data.user.id, { username: values.username, fullName: values.name })
  } catch (err) {
    if (err instanceof UsernameTakenError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    console.error("Profile update failed:", err)
    return NextResponse.json({ error: "Profile update failed" }, { status: 500 })
  }

  return NextResponse.json({ status: 200 })
}
