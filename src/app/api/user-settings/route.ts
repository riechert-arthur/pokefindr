import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAdminClient } from '@/lib/supabase/db'
import { getSessionUserId } from '@/server/auth/request'
import { UsernameTakenError, getProfile, updateProfile } from '@/server/services/users'

const updateSchema = z.object({
  fullName: z.string().trim().min(1).max(100).optional(),
  username: z.string().trim().min(1).max(50).optional(),
  email: z.string().trim().email().optional(),
})

export async function GET(req: NextRequest) {
  const userId = getSessionUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const profile = await getProfile(userId)
  if (!profile) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  // Email lives with the identity provider (Supabase Auth, for now).
  const { data: authUser, error: authError } = await getAdminClient().auth.admin.getUserById(userId)
  if (authError || !authUser?.user) {
    console.error('Auth user load error', authError)
    return NextResponse.json({ error: 'Could not load account' }, { status: 500 })
  }

  return NextResponse.json({
    fullName: profile.full_name,
    email: authUser.user.email,
    username: profile.username,
  })
}

export async function PATCH(req: NextRequest) {
  const userId = getSessionUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const parsed = updateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ') },
      { status: 400 },
    )
  }
  const { email, fullName, username } = parsed.data

  if (email !== undefined) {
    const { error: authError } = await getAdminClient().auth.admin.updateUserById(userId, { email })
    if (authError) {
      console.error('Auth email update failed', authError)
      return NextResponse.json({ error: authError.message }, { status: 500 })
    }
  }

  try {
    const found = await updateProfile(userId, { fullName, username })
    if (!found) return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  } catch (err) {
    if (err instanceof UsernameTakenError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    console.error('Profile update failed', err)
    return NextResponse.json({ error: 'Profile update failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
