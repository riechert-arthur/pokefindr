import { beforeEach, describe, expect, it } from "vitest"
import { randomBytes } from "node:crypto"
import { decodeJwt } from "jose"
import { eq } from "drizzle-orm"
import { GET as resourceMetadata } from "@/app/.well-known/oauth-protected-resource/[[...path]]/route"
import { GET as serverMetadata } from "@/app/.well-known/oauth-authorization-server/[[...path]]/route"
import { resetAuthForTests, revokeConnectedApps } from "@/server/auth/auth"
import { getDb } from "@/server/db/client"
import { oauthClients, oauthConsents, users } from "@/server/db/schema"
import { getConsentClient } from "@/server/services/oauth-clients"
import { authorizeContinuation, safeNext } from "@/lib/auth/oauth-continue"
import { BASE, REDIRECT, RESOURCE, authorize, b64url, registerClient, token } from "./oauthFlow"

beforeEach(() => resetAuthForTests())

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
    const { back } = await authorize(client_id, { accept: false })
    expect(back.searchParams.get("error")).toBe("access_denied")
    expect(back.searchParams.get("code")).toBeNull()
  })

  it("shows the consent page the app's name as text and the requested redirect's host, only for a signed request", async () => {
    const { client_id } = await registerClient("Claude\u202e (official)")
    const { consentUrl } = await authorize(client_id, { accept: false })
    const signed = consentUrl.searchParams
    expect(await getConsentClient(signed)).toEqual({ name: "Claude (official)", redirectHost: "127.0.0.1:43123" })
    // Anything changed after signing (another client, another redirect) isn't trusted.
    const tampered = new URLSearchParams(signed)
    tampered.set("redirect_uri", "https://evil.example/cb")
    expect(await getConsentClient(tampered)).toBeNull()
    const unsigned = new URLSearchParams(signed)
    unsigned.delete("sig")
    expect(await getConsentClient(unsigned)).toBeNull()
    await getDb().update(oauthClients).set({ disabled: true }).where(eq(oauthClients.clientId, client_id))
    expect(await getConsentClient(signed)).toBeNull()
  })

  it("disconnects every app on a password reset: refresh tokens stop working", async () => {
    const { client_id } = await registerClient()
    const { back, verifier } = await authorize(client_id)
    const res = await token({ grant_type: "authorization_code", code: back.searchParams.get("code")!, redirect_uri: REDIRECT, code_verifier: verifier, client_id, resource: RESOURCE })
    const { refresh_token } = (await res.json()) as { refresh_token: string }
    const [user] = await getDb().select().from(users)
    await revokeConnectedApps(user.id)
    expect((await token({ grant_type: "refresh_token", refresh_token, client_id, resource: RESOURCE })).status).toBe(400)
    expect(await getDb().select().from(oauthConsents)).toEqual([])
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
