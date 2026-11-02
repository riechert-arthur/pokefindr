import { NextResponse } from 'next/server'
import { clearSessionCookie } from '@/server/auth/session'

export async function POST() {
  return NextResponse.json(
    { ok: true },
    {
      status: 200,
      headers: { 'Set-Cookie': clearSessionCookie() },
    }
  )
}
