import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'
import { getServerConfig } from '@/server/config'

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
    '/api/reviews',
    '/api/reviews/:id',
    '/api/reviews/:id/:path*',
    '/api/auth/user/:path*',
    '/api/user-settings',
    '/api/user-settings/:path*',
    '/api/my-reviews/:path*',
  ],
}

function redirectToLogin(req: NextRequest) {
  const url = req.nextUrl.clone()
  url.pathname = '/login'
  return NextResponse.redirect(url)
}

export async function middleware(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return redirectToLogin(req)

  try {
    const { payload } = await jwtVerify<SessionJWTPayload>(
      token,
      encoder.encode(getServerConfig().JWT_SECRET)
    )

    // Pass the verified identity to route handlers as request headers.
    // Building a fresh header set means a client-supplied x-user-id or
    // x-user-tier can never reach a handler.
    const headers = new Headers(req.headers)
    headers.set('x-user-id', payload.sub)
    headers.set('x-user-tier', payload.tier ?? 'free')

    return NextResponse.next({ request: { headers } })
  } catch {
    return redirectToLogin(req)
  }
}
