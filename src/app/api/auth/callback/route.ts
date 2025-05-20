
// src/pages/api/auth/callback.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'
import { serialize } from 'cookie'
import { adminDB } from '@/lib/supabase/db'

const JWT_SECRET   = process.env.JWT_SECRET!
const COOKIE_NAME  = 'app_session'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const accessToken = body.access_token as string | undefined

  if (!accessToken) {
    return NextResponse.json(
      { error: "No access token" },
      { status: 401 }
    )
  }

  const { data: userData, error: getUserError } = 
    await adminDB.auth.getUser(accessToken)

  if (getUserError || !userData.user) {
    return NextResponse.json(
      { error: getUserError },
      { status: 500 }
    )
  }

  const user = userData.user

  const { data: sub } = await adminDB
    .from('subscriptions')
    .select('plan_name')
    .eq('user_id', user.id)
    .single()

  const tier = sub ? 'paid' : 'free'

  const token = jwt.sign(
    { sub: user.id, email: user.email, tier },
    JWT_SECRET,
    { expiresIn: '7d' }
  )

  const cookie = serialize(COOKIE_NAME, token, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  })

  return NextResponse.json(
    { ok: true },
    {
      status: 200,
      headers: { 'Set-Cookie': cookie },
    }
  )
}

