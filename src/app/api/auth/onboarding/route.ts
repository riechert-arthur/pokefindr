import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/db'
import { createSessionCookie } from '@/server/auth/session'
import { UsernameTakenError, getSessionTier, updateProfile } from '@/server/services/users'

interface OnboardBody {
  access_token: string
  username:     string
}

export async function POST(req: NextRequest) {
  let body: OnboardBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { access_token, username } = body
  if (!access_token) {
    return NextResponse.json({ error: 'Missing access_token' }, { status: 400 })
  }
  if (!username) {
    return NextResponse.json({ error: 'username is required' }, { status: 422 })
  }

  const {
    data: { user },
    error: authError
  } = await getAdminClient().auth.getUser(access_token)

  if (authError || !user) {
    console.error('Auth callback error', authError)
    return NextResponse.json({ error: 'Failed to fetch user' }, { status: 401 })
  }

  try {
    await updateProfile(user.id, {
      username,
      fullName: user.user_metadata.full_name,
      onboarded: true,
    })
  } catch (err) {
    if (err instanceof UsernameTakenError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    console.error('Onboarding update failed', err)
    return NextResponse.json({ error: 'Onboarding update failed' }, { status: 500 })
  }

  const tier = await getSessionTier(user.id)
  const cookie = createSessionCookie({ sub: user.id, email: user.email, tier })

  return NextResponse.json(
    { ok: true },
    { status: 200, headers: { 'Set-Cookie': cookie } }
  )
}
