import { headers } from "next/headers"
import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { AuthPage } from "@/components/forms/AuthPage"
import { ConsentForm } from "@/components/forms/ConsentForm"
import { getAuth } from "@/server/auth/auth"
import { getConsentClient } from "@/server/services/oauth-clients"
import { getProfile } from "@/server/services/users"
import { SCOPE_LABELS } from "@/lib/mcp/scopes"
import { authorizeContinuation } from "@/lib/auth/oauth-continue"

export const metadata: Metadata = { title: "Connect an app", robots: { index: false } }
export const dynamic = "force-dynamic"

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

/**
 * Where Better Auth sends someone whose MCP client asks for their account
 * (#134): what's asking, for what, and Allow or Cancel. The query is the
 * signed authorization request, which ConsentForm passes back.
 */
export default async function ConsentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) for (const x of Array.isArray(v) ? v : v === undefined ? [] : [v]) params.append(k, x)
  const session = await getAuth()
    .api.getSession({ headers: await headers() })
    .catch(() => null)
  // Without a session there's nothing to approve for: back through authorize, which sends them to log in and returns here.
  if (!session) redirect(authorizeContinuation(params) ?? "/login")
  const [client, profile] = await Promise.all([getConsentClient(params), getProfile(session.user.id)])
  if (!client || !profile) {
    return (
      <AuthPage>
        <p role="alert" className="text-center text-body text-foreground">
          This link has expired or isn&apos;t valid. Start connecting from the app again.
        </p>
      </AuthPage>
    )
  }
  const scopes = (one(query.scope) ?? "").split(" ")
  const permissions = Object.entries(SCOPE_LABELS)
    .filter(([s]) => scopes.includes(s))
    .map(([, label]) => label)
  return (
    <AuthPage>
      <ConsentForm client={client} username={profile.username ?? "you"} permissions={permissions.length ? permissions : ["See that you have a PokeFindr account"]} />
    </AuthPage>
  )
}
