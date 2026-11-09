import "server-only"
import { eq } from "drizzle-orm"
import { verifyOAuthQueryParams } from "@better-auth/oauth-provider"
import { getDb, type Database } from "@/server/db/client"
import { oauthClients } from "@/server/db/schema"
import { getAuth } from "@/server/auth/auth"
import { plainUserText } from "@/server/assistant/untrusted"

/** What the consent page shows about the app asking for access. */
export interface ConsentClient {
  name: string
  /** Where approving sends you back to: the host people can check. */
  redirectHost: string
}

const hostOf = (url: string) => {
  try {
    const u = new URL(url)
    return u.host || u.protocol.replace(/:$/, "")
  } catch {
    return null
  }
}

/**
 * The client named by the consent page's query, or null when the query
 * isn't a request Better Auth signed (so nothing in it was checked) or the
 * client is gone. The name comes from the app's own registration, so it's
 * shown as plain text, next to the host of the redirect this request asked
 * for, which the authorize endpoint checked before signing it. The app's
 * own `client_uri` isn't shown: nothing checks it.
 */
export async function getConsentClient(query: URLSearchParams, db: Database = getDb()): Promise<ConsentClient | null> {
  const clientId = query.get("client_id")
  const redirectUri = query.get("redirect_uri")
  if (!clientId || !redirectUri || !query.get("sig")) return null
  const { secret } = await getAuth().$context
  if (!(await verifyOAuthQueryParams(query.toString(), secret).catch(() => false))) return null
  const [c] = await db.select({ name: oauthClients.name, disabled: oauthClients.disabled }).from(oauthClients).where(eq(oauthClients.clientId, clientId))
  const redirectHost = hostOf(redirectUri)
  if (!c || c.disabled || !redirectHost) return null
  return { name: plainUserText(c.name ?? "", 60) || hostOf(clientId) || "An app", redirectHost }
}
