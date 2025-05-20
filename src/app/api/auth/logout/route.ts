import { NextResponse } from 'next/server'
import { serialize } from 'cookie'

const COOKIE_NAME = 'app_session'

export async function POST() {
  const cookie = serialize(COOKIE_NAME, '', {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: new Date(0),
  })

  return NextResponse.json(
    { ok: true },
    {
      status: 200,
      headers: { 'Set-Cookie': cookie },
    }
  )
}
