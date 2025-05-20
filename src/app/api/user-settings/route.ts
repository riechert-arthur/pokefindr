
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { adminDB } from '@/lib/supabase/db'

interface UpdateRequest {
  fullName?: string
  username?: string
  email?: string
}

interface ProfileUpdates {
  full_name?: string
  username?: string
}

export async function GET(req: NextRequest) {
  const userId = req.headers.get("x-user-id")
  if (!userId) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  }

  const { data: profile, error } = await adminDB
    .from('profiles')
    .select('id, username, full_name, metadata')
    .eq('id', userId)
    .single()

  if (error || !profile) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 })
  }

  const { data: authUser, error: authError } =
    await adminDB.auth.admin.getUserById(userId)

  if (authError || !authUser?.user) {
    console.error('Auth user load error', authError)
    return NextResponse.json({}, { status: 500 })
  }

  return NextResponse.json({
    fullName: profile.full_name,
    email:    authUser.user.email,
    username: profile.username,
  })

}

export async function PATCH(req: NextRequest) {
  const userId = req.headers.get("x-user-id")
  if (!userId) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  }

  const updates = (await req.json()) as UpdateRequest

  const dbUpdates: ProfileUpdates = {}

  if (updates.fullName !== undefined) {
    dbUpdates.full_name = updates.fullName
  }
  if (updates.username !== undefined) {
    dbUpdates.username = updates.username
  }

  if (updates.email !== undefined) {
    const { error: authError } = await adminDB.auth.admin.updateUserById(
      userId,
      { email: updates.email }
    )
    if (authError) {
      console.error('Auth email update failed', authError)
      return NextResponse.json({ error: authError.message }, { status: 500 })
    }
  }

  if (Object.keys(dbUpdates).length > 0) {
    const { error: profileError } = await adminDB
      .from('profiles')
      .update(dbUpdates)
      .eq('id', userId)

    if (profileError) {
      console.error('Profile update failed', profileError)
      return NextResponse.json({ error: profileError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
