import { headers } from "next/headers"
import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { AuthPage } from "@/components/forms/AuthPage"
import { ConsentForm } from "@/components/forms/ConsentForm"
import { getAuth } from "@/server/auth/auth"
import { getConsentClient } from "@/server/services/oauth-clients"
import { getProfile } from "@/server/services/users"
import { SCOPE_LABELS } from "@/lib/mcp/scopes"

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
  const clientId = one(query.client_id)
  const session = await getAuth()
    .api.getSession({ headers: await headers() })
    .catch(() => null)
  // Without a session there's nothing to approve for; login brings them back through authorize.
  if (!session) redirect("/login")
  const [client, profile] = await Promise.all([clientId && one(query.sig) ? getConsentClient(clientId, one(query.redirect_uri) ?? null) : null, getProfile(session.user.id)])
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
