import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import createIntlMiddleware from 'next-intl/middleware'
import { SESSION_COOKIE_NAME } from '@/server/auth/cookie'
import { getJwtSecret } from '@/server/edge-config'
import { LOCALE_COOKIE, PUBLIC_LOCALES, routing, type Locale } from '@/i18n/routing'
import { apiError } from '@/server/api-error'

const encoder     = new TextEncoder()
const intl        = createIntlMiddleware(routing)

interface SessionJWTPayload {
  sub: string
  tier?: string    // e.g. 'paid' | 'free'
}

// Next reads this at build time, so it has to be a literal.
export const config = {
  matcher: [
    // The API routes that need a session.
    '/api/reviews',
    '/api/reviews/:id',
    '/api/reviews/:id/:path*',
    '/api/auth/user/:path*',
    '/api/user-settings',
    '/api/user-settings/:path*',
    '/api/my-reviews/:path*',
    '/api/locations/:id/reports',
    '/api/submissions',
    '/api/submissions/:path*',
    '/api/admin/:path*',
    '/api/assistant',
    '/api/assistant/:path*',
    // Every page, for the language (docs/i18n.md). Not the API, Next's own
    // files, /.well-known, the generated icons and images, or anything with a
    // file extension, or BotID's proxy (#198).
    '/((?!api|_next|_vercel|\\.well-known|social-card|\\w+/social-card|149e9513-01fa-4fb0-aad4-566afd725d1b|icon|apple-icon|.*\\..*).*)',
  ],
}

/** The pages that need a session, after any language prefix. */
const SESSION_PAGES = /^\/(home|settings|admin)(\/|$)/

const LOCALE_PREFIX = new RegExp(`^/(${routing.locales.join('|')})(?=/|$)`)

/** The path as next-intl and the router see it: `/%68ome` is `/home`. */
function decodedPath(pathname: string): string {
  try {
    return decodeURI(pathname)
  } catch {
    // Not valid percent-encoding: next-intl leaves it as it is too.
    return pathname
  }
}

/** The language prefix of a page's path, if any, and the path without it. */
function splitLocale(pathname: string): { locale: Locale | null; path: string } {
  const match = pathname.match(LOCALE_PREFIX)
  if (!match) return { locale: null, path: pathname }
  return { locale: match[1] as Locale, path: pathname.slice(match[0].length) || '/' }
}

function redirectToLogin(req: NextRequest, locale: Locale | null) {
  // An API call gets a 401 it can act on. A redirect would make fetch follow
  // it (a POST re-sent to /login) and get the login page back.
  if (req.nextUrl.pathname.startsWith('/api/')) {
    // `code` is the page's message for it (apiErrors in messages/*.yml).
    return apiError('loginRequired', 'Log in to continue', 401)
  }
  const url = req.nextUrl.clone()
  url.pathname = locale && locale !== routing.defaultLocale ? `/${locale}/login` : '/login'
  return NextResponse.redirect(url)
}

/** The session's identity, or null. Throws if the secret is missing: a server error, not a bad token. */
async function verifiedUser(req: NextRequest): Promise<SessionJWTPayload | null> {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!token) return null
  const secret = encoder.encode(getJwtSecret())
  try {
    return (await jwtVerify<SessionJWTPayload>(token, secret)).payload
  } catch {
    return null
  }
}

/**
 * Request headers with the verified identity for route handlers and pages,
 * or with none. Starting from the client's headers and always deleting or
 * setting these means a client-supplied x-user-id or x-user-tier never gets
 * through.
 */
function identityHeaders(req: NextRequest, user: SessionJWTPayload | null) {
  const headers = new Headers(req.headers)
  headers.delete('x-user-id')
  headers.delete('x-user-tier')
  if (user) {
    headers.set('x-user-id', user.sub)
    headers.set('x-user-tier', user.tier ?? 'free')
  }
  return headers
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (pathname.startsWith('/api/')) {
    const user = await verifiedUser(req)
    if (!user) return redirectToLogin(req, null)
    return NextResponse.next({ request: { headers: identityHeaders(req, user) } })
  }

  // Pages: check the session where one is needed, then let next-intl pick the
  // language. It passes these headers on to the page.
  // Matched on the decoded path, or an encoded one (`/%68ome`) would skip the check.
  const { locale, path } = splitLocale(decodedPath(pathname))
  let user: SessionJWTPayload | null = null
  if (SESSION_PAGES.test(path)) {
    user = await verifiedUser(req)
    if (!user) return redirectToLogin(req, locale)
  }
  return intl(new NextRequest(req, { headers: publicDetection(identityHeaders(req, user)) }))
}

const isPublic = (tag: string) => (PUBLIC_LOCALES as readonly string[]).includes(tag.trim().split(/[-;]/)[0].toLowerCase())

/**
 * next-intl detects from every language in LOCALES. Before it looks, drop
 * the languages that aren't public from Accept-Language and a cookie naming
 * one, so a language still being written is only reached by its URL
 * (docs/i18n.md).
 */
export function publicDetection(headers: Headers): Headers {
  const accept = headers.get('accept-language')
  if (accept) {
    const kept = accept.split(',').filter((part) => part.split(';')[0].trim() === '*' || isPublic(part))
    if (kept.length) headers.set('accept-language', kept.join(','))
    else headers.delete('accept-language')
  }
  const cookie = headers.get('cookie')
  if (cookie) {
    const kept = cookie.split(/;\s*/).filter((c) => !c.startsWith(`${LOCALE_COOKIE}=`) || isPublic(c.slice(LOCALE_COOKIE.length + 1)))
    if (kept.length) headers.set('cookie', kept.join('; '))
    else headers.delete('cookie')
  }
  return headers
}
