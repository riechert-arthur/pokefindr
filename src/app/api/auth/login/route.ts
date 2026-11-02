import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyUserCredentials } from '@/lib/supabase/auth'
import { getAdminClient } from '@/lib/supabase/db'
import { createSessionCookie } from '@/server/auth/session'

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()

  const user = await verifyUserCredentials(email, password)
  if (!user) {
    return NextResponse.json({ error: 'Invalid credentials or email needs to be verified' }, { status: 401 })
  }

  const { data: sub } = await getAdminClient()
    .from('subscriptions')
    .select('plan_name')
    .eq('user_id', user.id)
    .single()

  const cookie = createSessionCookie({
    sub: user.id,
    email: user.email,
    tier: sub ? 'paid' : 'free',
  })

  return NextResponse.json({ ok: true }, {
    status: 200,
    headers: { 'Set-Cookie': cookie },
  })
}
