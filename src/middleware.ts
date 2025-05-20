
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { parse } from 'cookie'
import { jwtVerify } from 'jose'

const COOKIE_NAME = 'app_session'
const encoder     = new TextEncoder()

interface SessionJWTPayload {
  sub: string     
  tier?: string    // e.g. 'paid' | 'free'
}

export const config = {
  matcher: [
    '/home/:path*',
    '/settings/:path*',
    '/api/reviews/:id',
    '/api/reviews/:id/:path*',
    '/api/auth/user/:path*',
    '/api/user-settings',
    '/api/user-settings/:path*',
    '/api/my-reviews/:path*',
  ],
}

export async function middleware(req: NextRequest) {
  const cookies = parse(req.headers.get('cookie') || '')
  const token   = cookies[COOKIE_NAME]

  if (!token) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  try {
    const { payload } = await jwtVerify<SessionJWTPayload>(
      token,
      encoder.encode(process.env.JWT_SECRET!)
    )

    const userId   = payload.sub
    const userTier = payload.tier ?? 'free'

    const response = NextResponse.next()
    response.headers.set('x-user-id',   userId)
    response.headers.set('x-user-tier', userTier)
    return response
  } catch {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }
}

