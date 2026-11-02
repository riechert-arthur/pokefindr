import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/db'
import { createSessionCookie } from '@/server/auth/session'
import { getOnboardingState, getSessionTier } from '@/server/services/users'

export async function POST(req: NextRequest) {
  const { access_token } = await req.json().catch(() => ({}))
  if (!access_token) {
    return NextResponse.json({ error: 'Missing access token' }, { status: 400 })
  }

  const {
    data: { user },
    error: authError
  } = await getAdminClient().auth.getUser(access_token)

  if (authError || !user) {
    console.error('Auth callback error', authError)
    return NextResponse.json({ error: 'Failed to fetch user' }, { status: 401 })
  }

  const state = await getOnboardingState(user.id)
  if (!state) {
    return NextResponse.json({ error: 'No account found' }, { status: 404 })
  }

  // OAuth users pick a username first; the client then calls /api/auth/onboarding.
  if (!state.onboarded) {
    return new NextResponse(null, { status: 204 })
  }

  const tier = await getSessionTier(user.id)
  const cookie = createSessionCookie({ sub: user.id, email: user.email, tier })

  return NextResponse.json(
    { ok: true },
    { status: 200, headers: { 'Set-Cookie': cookie } }
  )
}
