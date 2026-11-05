import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/db'
import { createSessionCookie, tierFromPlanName } from '@/server/auth/session'

export async function POST(req: NextRequest) {
  const { access_token } = await req.json()
  if (!access_token) {
    return NextResponse.json(
      { error: 'Missing access token' },
      { status: 400 }
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

  const { data, error } = await getAdminClient()
    .from('profiles')
    .select(`
      id,
      full_name,
      username,
      onboarded, 
      subscriptions ( plan_name )
    `)
    .eq('id', user.id)
    .single()

  if (!data) {
    return NextResponse.json(
      { error: "No account found" },
      { status: 404 },
    )
  }

  if (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }

  if (!data.onboarded) {
    return new NextResponse(null, { status: 204 }) 
  }

  const planName = data.subscriptions?.[0]?.plan_name
  const tier = tierFromPlanName(planName)

  const cookie = createSessionCookie({ sub: user.id, email: user.email, tier })

  return NextResponse.json(
    { ok: true },
    {
      status: 200,
      headers: { 'Set-Cookie': cookie }
    }
  )
}

