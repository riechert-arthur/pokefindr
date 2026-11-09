import { expect } from "vitest"
import { createHash, randomBytes } from "node:crypto"
import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { GET as identityGet, POST as identityPost } from "@/app/api/identity/[...all]/route"
import { POST as signup } from "@/app/api/auth/signup/route"
import { POST as login } from "@/app/api/auth/login/route"
import { getDb } from "@/server/db/client"
import { users } from "@/server/db/schema"
import { authorizeContinuation } from "@/lib/auth/oauth-continue"

/**
 * An MCP client's side of PokeFindr's OAuth (#134), for tests: register,
 * authorize with PKCE (logging in on the way), consent, and swap the code
 * for tokens. Requests go straight to the route handlers.
 */

export const BASE = "http://localhost:3000"
export const RESOURCE = `${BASE}/api/mcp/account`
export const REDIRECT = "http://127.0.0.1:43123/callback"
export const ALL_SCOPES = "openid profile offline_access account:read places:submit"

export const identity = (path: string, init: RequestInit = {}) => {
  const req = new Request(`${BASE}/api/identity${path}`, init)
  return (init.method ?? "GET") === "GET" ? identityGet(req) : identityPost(req)
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ")
export const b64url = (b: Buffer) => b.toString("base64url")

/** A public MCP client, registered the 2025 way (dynamic registration). */
export async function registerClient(name = "Test MCP client") {
  const res = await identity("/oauth2/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: name, redirect_uris: [REDIRECT], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }),
  })
  expect(res.status, await res.clone().text()).toBe(201)
  return (await res.json()) as { client_id: string }
}

/** Signs up a confirmed account and logs in through our own route: its cookies. */
export async function signIn(username = "ash") {
  const email = `${username}@example.com`
  const form = { name: "Ash Ketchum", username, email, password: "pallet-town-forever!", passwordVerification: "pallet-town-forever!" }
  const req = (body: unknown) => new NextRequest(`${BASE}/api/auth/x`, { method: "POST", body: JSON.stringify(body), headers: { origin: BASE } })
  expect((await signup(req(form))).status).toBe(200)
  await getDb().update(users).set({ emailVerified: true }).where(eq(users.email, email))
  const res = await login(req({ email, password: form.password }))
  expect(res.status).toBe(200)
  const [user] = await getDb().select({ id: users.id }).from(users).where(eq(users.email, email))
  return { cookie: cookiesOf(res), userId: user.id }
}

export function authorizeUrl(clientId: string, scope = ALL_SCOPES) {
  const verifier = b64url(randomBytes(32))
  const url = new URL(`${BASE}/api/identity/oauth2/authorize`)
  for (const [k, v] of Object.entries({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT,
    scope,
    state: "state-123",
    code_challenge: b64url(createHash("sha256").update(verifier).digest()),
    code_challenge_method: "S256",
    resource: RESOURCE,
  }))
    url.searchParams.set(k, v)
  return { url, verifier }
}

export const getUrl = (url: string, cookie?: string) => {
  const u = new URL(url, BASE)
  return identity(u.pathname.replace("/api/identity", "") + u.search, { headers: cookie ? { cookie } : {} })
}

/**
 * The browser part: authorize while logged out, log in (`signedIn`, or a new
 * account), consent. Returns where the browser lands back at the client.
 */
export async function authorize(clientId: string, { accept = true, scope = ALL_SCOPES, signedIn }: { accept?: boolean; scope?: string; signedIn?: { cookie: string } } = {}) {
  const { url, verifier } = authorizeUrl(clientId, scope)
  const toLogin = await getUrl(url.toString())
  expect(toLogin.status).toBe(302)
  const loginUrl = new URL(toLogin.headers.get("location")!, BASE)
  expect(loginUrl.pathname).toBe("/login")
  const next = authorizeContinuation(loginUrl.searchParams)
  expect(next).not.toBeNull()

  const { cookie } = signedIn ?? (await signIn())
  const toConsent = await getUrl(next!, cookie)
  expect(toConsent.status).toBe(302)
  const consentUrl = new URL(toConsent.headers.get("location")!, BASE)
  expect(consentUrl.pathname).toBe("/oauth/consent")

  const answered = await identity("/oauth2/consent", {
    method: "POST",
    headers: { "content-type": "application/json", cookie, origin: BASE },
    body: JSON.stringify({ accept, oauth_query: consentUrl.search.slice(1) }),
  })
  expect(answered.status, await answered.clone().text()).toBe(200)
  const back = new URL(((await answered.json()) as { url: string }).url)
  return { back, verifier, consentUrl, cookie }
}

export const token = (body: Record<string, string>) =>
  identity("/oauth2/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body).toString() })

/** The whole flow: a fresh client, signed in as `signedIn` (or a new account), and its access token. */
export async function accessToken(opts: { scope?: string; signedIn?: { cookie: string } } = {}) {
  const { client_id } = await registerClient()
  const { back, verifier } = await authorize(client_id, opts)
  const res = await token({ grant_type: "authorization_code", code: back.searchParams.get("code")!, redirect_uri: REDIRECT, code_verifier: verifier, client_id, resource: RESOURCE })
  expect(res.status, await res.clone().text()).toBe(200)
  return ((await res.json()) as { access_token: string }).access_token
}
