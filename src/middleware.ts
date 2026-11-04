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
    '/api/reviews/:id',
    '/api/reviews/:id/:path*',
    '/api/locations/:id/reviews',
    '/api/auth/user/:path*',
    '/api/user-settings',
    '/api/user-settings/:path*',
    '/api/my-reviews/:path*',
  ],
}

/** Routes in the matcher that anyone may read; writes still need a session. */
const PUBLIC_READS = [/^\/api\/locations\/[^/]+\/reviews$/]

function isPublicRead(req: NextRequest) {
  return (
    (req.method === 'GET' || req.method === 'HEAD') &&
    PUBLIC_READS.some((re) => re.test(req.nextUrl.pathname))
  )
}

function unauthenticated(req: NextRequest) {
  // API callers get a 401 they can handle; a redirect would hand fetch/axios
  // the login page's HTML with a 200 status.
  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }
  const url = req.nextUrl.clone()
  url.pathname = '/login'
  return NextResponse.redirect(url)
}

/** Request headers with any client-supplied identity removed. */
function strippedHeaders(req: NextRequest) {
  const headers = new Headers(req.headers)
  headers.delete('x-user-id')
  headers.delete('x-user-tier')
  return headers
}

export async function middleware(req: NextRequest) {
  const headers = strippedHeaders(req)
  if (isPublicRead(req)) return NextResponse.next({ request: { headers } })

  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return unauthenticated(req)

  try {
    const { payload } = await jwtVerify<SessionJWTPayload>(
      token,
      encoder.encode(getServerConfig().JWT_SECRET)
    )

    // Pass the verified identity to route handlers as request headers.
    headers.set('x-user-id', payload.sub)
    headers.set('x-user-tier', payload.tier ?? 'free')
    return NextResponse.next({ request: { headers } })
  } catch {
    return unauthenticated(req)
  }
}
