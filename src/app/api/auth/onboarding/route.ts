
import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/db'
import { createSessionCookie, tierFromPlanName } from '@/server/auth/session'

interface OnboardBody {
  access_token: string
  username:     string
}

export async function POST(req: NextRequest) {
  let body: OnboardBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON' },
      { status: 400 }
    )
  }

  const { access_token, username } = body

  if (!access_token) {
    return NextResponse.json(
      { error: 'Missing access_token' },
      { status: 400 }
    )
  }
  if (!username) {
    return NextResponse.json(
      { error: 'username is required' },
      { status: 422 }
    )
  }

  const {
    data: { user },
    error: authError
  } = await getAdminClient().auth.getUser(access_token)

  if (authError || !user) {
    console.error('Auth callback error', authError)
    return NextResponse.json(
      { error: 'Failed to fetch user' },
      { status: 401 }
    )
  }

  const { error: profileError } = await getAdminClient()
    .from('profiles')
    .update({
      username,
      full_name: user.user_metadata.full_name,
      onboarded: true,
    })
    .eq('id', user.id)

  if (profileError) {
    console.error('Onboarding update failed', profileError)
    return NextResponse.json(
      { error: profileError.message },
      { status: 500 }
    )
  }

  const { data: subData, error: subError } = await getAdminClient()
    .from('subscriptions')
    .select('plan_name')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (subError && subError.code !== 'PGRST116') { 
    console.error('Subscription lookup failed', subError)
    return NextResponse.json(
      { error: 'Subscription lookup error' },
      { status: 500 }
    )
  }

  const tier = tierFromPlanName(subData?.plan_name)

  const cookie = createSessionCookie({ sub: user.id, email: user.email, tier })

  return NextResponse.json(
    { ok: true },
    {
      status: 200,
      headers: { 'Set-Cookie': cookie },
    }
  )
}

