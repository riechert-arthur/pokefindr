import { beforeEach, describe, expect, it } from "vitest"
import { createHash, randomBytes } from "node:crypto"
import { NextRequest } from "next/server"
import { decodeJwt } from "jose"
import { eq } from "drizzle-orm"
import { GET as identityGet, POST as identityPost } from "@/app/api/identity/[...all]/route"
import { POST as signup } from "@/app/api/auth/signup/route"
import { POST as login } from "@/app/api/auth/login/route"
import { GET as resourceMetadata } from "@/app/.well-known/oauth-protected-resource/[[...path]]/route"
import { GET as serverMetadata } from "@/app/.well-known/oauth-authorization-server/[[...path]]/route"
import { resetAuthForTests } from "@/server/auth/auth"
import { getDb } from "@/server/db/client"
import { oauthClients, users } from "@/server/db/schema"
import { getConsentClient } from "@/server/services/oauth-clients"
import { authorizeContinuation, safeNext } from "@/lib/auth/oauth-continue"

const BASE = "http://localhost:3000"
const RESOURCE = `${BASE}/api/mcp/account`
const REDIRECT = "http://127.0.0.1:43123/callback"
const SCOPE = "openid profile offline_access account:read places:submit"

beforeEach(() => resetAuthForTests())

const identity = (path: string, init: RequestInit = {}) => {
  const req = new Request(`${BASE}/api/identity${path}`, init)
  return (init.method ?? "GET") === "GET" ? identityGet(req) : identityPost(req)
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ")
const b64url = (b: Buffer) => b.toString("base64url")

/** A public MCP client, registered the 2025 way (dynamic registration). */
async function registerClient(name = "Test MCP client") {
  const res = await identity("/oauth2/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: name, redirect_uris: [REDIRECT], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }),
  })
  expect(res.status, await res.clone().text()).toBe(201)
  return (await res.json()) as { client_id: string; client_secret?: string }
}

/** A confirmed account, logged in through our own route: its cookies. */
async function loggedIn() {
  const form = { name: "Ash Ketchum", username: "ash", email: "ash@example.com", password: "pallet-town-forever!", passwordVerification: "pallet-town-forever!" }
  const req = (body: unknown) => new NextRequest(`${BASE}/api/auth/x`, { method: "POST", body: JSON.stringify(body), headers: { origin: BASE } })
  expect((await signup(req(form))).status).toBe(200)
  await getDb().update(users).set({ emailVerified: true }).where(eq(users.email, form.email))
  const res = await login(req({ email: form.email, password: form.password }))
  expect(res.status).toBe(200)
  return cookiesOf(res)
}

function authorizeUrl(clientId: string) {
  const verifier = b64url(randomBytes(32))
  const url = new URL(`${BASE}/api/identity/oauth2/authorize`)
  for (const [k, v] of Object.entries({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT,
    scope: SCOPE,
    state: "state-123",
    code_challenge: b64url(createHash("sha256").update(verifier).digest()),
    code_challenge_method: "S256",
    resource: RESOURCE,
  }))
    url.searchParams.set(k, v)
  return { url, verifier }
}

const get = (url: string, cookie?: string) => identity(new URL(url, BASE).pathname.replace("/api/identity", "") + new URL(url, BASE).search, { headers: cookie ? { cookie } : {} })

/** Runs the browser part of the flow: not logged in, log in, consent. The redirect back to the client. */
async function authorize(clientId: string, accept = true) {
  const { url, verifier } = authorizeUrl(clientId)
  const toLogin = await get(url.toString())
  expect(toLogin.status).toBe(302)
  const loginUrl = new URL(toLogin.headers.get("location")!, BASE)
  expect(loginUrl.pathname).toBe("/login")
  const next = authorizeContinuation(loginUrl.searchParams)
  expect(next).not.toBeNull()

  const cookie = await loggedIn()
  const toConsent = await get(next!, cookie)
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

const token = (body: Record<string, string>) =>
  identity("/oauth2/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body).toString() })

describe("MCP OAuth", () => {
  it("serves discovery at the site root: the resource, its authorization server, and the endpoints", async () => {
    const res = await resourceMetadata(new Request(`${BASE}/.well-known/oauth-protected-resource/api/mcp/account`))
    expect(res.status).toBe(200)
    expect(res.headers.get("access-control-allow-origin")).toBe("*")
    const resource = await res.json()
    expect(resource).toMatchObject({ resource: RESOURCE, authorization_servers: [`${BASE}/api/identity`], scopes_supported: ["account:read", "places:submit"] })

    const meta = await (await serverMetadata(new Request(`${BASE}/.well-known/oauth-authorization-server/api/identity`))).json()
    expect(meta).toMatchObject({
      issuer: `${BASE}/api/identity`,
      authorization_endpoint: `${BASE}/api/identity/oauth2/authorize`,
      token_endpoint: `${BASE}/api/identity/oauth2/token`,
      registration_endpoint: `${BASE}/api/identity/oauth2/register`,
      code_challenge_methods_supported: ["S256"],
    })
    expect(meta.client_id_metadata_document_supported).toBe(true)
  })

  it("logs in, asks for consent, and issues a token for /api/mcp/account that refreshes", async () => {
    const { client_id } = await registerClient()
    const { back, verifier } = await authorize(client_id)
    expect(`${back.origin}${back.pathname}`).toBe(REDIRECT)
    expect(back.searchParams.get("state")).toBe("state-123")
    const code = back.searchParams.get("code")!

    const res = await token({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, code_verifier: verifier, client_id, resource: RESOURCE })
    expect(res.status, await res.clone().text()).toBe(200)
    const tokens = (await res.json()) as { access_token: string; refresh_token: string; scope: string; expires_in: number }
    const claims = decodeJwt(tokens.access_token)
    const [user] = await getDb().select().from(users)
    expect(claims).toMatchObject({ sub: user.id, iss: `${BASE}/api/identity`, azp: client_id })
    expect([claims.aud].flat()).toContain(RESOURCE)
    expect(String(claims.scope).split(" ")).toEqual(expect.arrayContaining(["account:read", "places:submit"]))
    expect(tokens.expires_in).toBeLessThanOrEqual(3600)

    const refreshed = await token({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id, resource: RESOURCE })
    expect(refreshed.status, await refreshed.clone().text()).toBe(200)
    const next = (await refreshed.json()) as { access_token: string; refresh_token: string }
    expect(decodeJwt(next.access_token)).toMatchObject({ sub: user.id })

    // A code works once; using it again (a stolen code) also revokes what it was exchanged for.
    expect((await token({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, code_verifier: verifier, client_id, resource: RESOURCE })).status).toBe(400)
    expect((await token({ grant_type: "refresh_token", refresh_token: next.refresh_token, client_id, resource: RESOURCE })).status).toBe(400)
  })

  it("needs the right PKCE verifier", async () => {
    const { client_id } = await registerClient()
    const { back } = await authorize(client_id)
    const res = await token({ grant_type: "authorization_code", code: back.searchParams.get("code")!, redirect_uri: REDIRECT, code_verifier: b64url(randomBytes(32)), client_id, resource: RESOURCE })
    expect(res.status).toBe(400)
  })

  it("sends a Cancel back to the app as access_denied, with no code", async () => {
    const { client_id } = await registerClient()
    const { back } = await authorize(client_id, false)
    expect(back.searchParams.get("error")).toBe("access_denied")
    expect(back.searchParams.get("code")).toBeNull()
  })

  it("shows the consent page the app's name as text, and the redirect's host", async () => {
    const { client_id } = await registerClient("Claude‮ (official)")
    expect(await getConsentClient(client_id, REDIRECT)).toEqual({ name: "Claude (official)", redirectHost: "127.0.0.1:43123", uri: null })
    expect(await getConsentClient("nope", REDIRECT)).toBeNull()
    await getDb().update(oauthClients).set({ disabled: true }).where(eq(oauthClients.clientId, client_id))
    expect(await getConsentClient(client_id, REDIRECT)).toBeNull()
  })
})

describe("authorizeContinuation", () => {
  const signed = new URLSearchParams({ response_type: "code", client_id: "c1", redirect_uri: REDIRECT, scope: "openid", prompt: "login consent", max_age: "0", sig: "s", exp: "1", ba_iat: "2", ba_pl: "x" })
  signed.append("ba_param", "client_id")

  it("goes back to authorize without the signature, and without the login prompt it just met", () => {
    const next = new URL(authorizeContinuation(signed)!, BASE)
    expect(next.pathname).toBe("/api/identity/oauth2/authorize")
    expect([...next.searchParams.keys()].sort()).toEqual(["client_id", "prompt", "redirect_uri", "response_type", "scope"])
    expect(next.searchParams.get("prompt")).toBe("consent")
  })

  it("ignores a login page that isn't an authorization", () => {
    expect(authorizeContinuation({ verified: "1" })).toBeNull()
    expect(authorizeContinuation({ client_id: "c1", response_type: "code" })).toBeNull()
  })

  it("only ever goes to the authorize endpoint", () => {
    expect(safeNext("/api/identity/oauth2/authorize?client_id=c1")).toBe("/api/identity/oauth2/authorize?client_id=c1")
    for (const bad of ["https://evil.example/api/identity/oauth2/authorize?x", "//evil.example/api/identity/oauth2/authorize?x", "/home", "/api/identity/oauth2/authorize/../../../x?y", "/api/identity/oauth2/authorize\\@evil?x", null]) {
      expect(safeNext(bad)).toBeNull()
    }
  })
})
