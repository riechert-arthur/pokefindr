import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyUserCredentials } from '@/lib/supabase/auth'
import { createSessionCookie } from '@/server/auth/session'
import { getSessionTier } from '@/server/services/users'

export async function POST(req: NextRequest) {
  const { email, password } = await req.json().catch(() => ({}))
  if (typeof email !== 'string' || typeof password !== 'string') {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }

  const user = await verifyUserCredentials(email, password)
  if (!user) {
    return NextResponse.json({ error: 'Invalid credentials or email needs to be verified' }, { status: 401 })
  }

  const cookie = createSessionCookie({
    sub: user.id,
    email: user.email,
    tier: await getSessionTier(user.id),
  })

  return NextResponse.json({ ok: true }, {
    status: 200,
    headers: { 'Set-Cookie': cookie },
  })
}
