import "server-only"
import { eq } from "drizzle-orm"
import { getDb, type Database } from "@/server/db/client"
import { oauthClients } from "@/server/db/schema"
import { plainUserText } from "@/server/assistant/untrusted"

/** What the consent page shows about the app asking for access. */
export interface ConsentClient {
  name: string
  /** Where approving sends you back to: the host people can check. */
  redirectHost: string | null
  /** The app's site, when it gave one. */
  uri: string | null
}

const hostOf = (url: string | null | undefined) => {
  try {
    return url ? new URL(url).host || new URL(url).protocol.replace(/:$/, "") : null
  } catch {
    return null
  }
}

/**
 * The client named by an authorization request. Its name and site come
 * from the app itself (its registration), so they're shown as plain text,
 * next to the redirect's host, which the authorize endpoint has checked.
 */
export async function getConsentClient(clientId: string, redirectUri: string | null, db: Database = getDb()): Promise<ConsentClient | null> {
  const [c] = await db.select({ name: oauthClients.name, uri: oauthClients.uri, redirectUris: oauthClients.redirectUris, disabled: oauthClients.disabled }).from(oauthClients).where(eq(oauthClients.clientId, clientId))
  if (!c || c.disabled) return null
  const redirect = redirectUri && c.redirectUris.includes(redirectUri) ? redirectUri : c.redirectUris[0]
  return {
    name: plainUserText(c.name ?? "", 60) || hostOf(clientId) || "An app",
    redirectHost: hostOf(redirect),
    uri: c.uri && /^https:\/\//.test(c.uri) ? c.uri : null,
  }
}
