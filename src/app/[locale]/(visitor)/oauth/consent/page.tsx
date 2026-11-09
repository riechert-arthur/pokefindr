import { headers } from "next/headers"
// The authorize endpoint is an API route, outside the languages.
// eslint-disable-next-line no-restricted-imports
import { redirect } from "next/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import { redirect as localizedRedirect } from "@/i18n/navigation"
import type { Metadata } from "next"
import type { Locale } from "@/i18n/routing"
import { AuthPage } from "@/components/forms/AuthPage"
import { ConsentForm } from "@/components/forms/ConsentForm"
import { getAuth } from "@/server/auth/auth"
import { getConsentClient } from "@/server/services/oauth-clients"
import { getProfile } from "@/server/services/users"
import type { LocaleParams } from "@/i18n/static"
import { authorizeContinuation } from "@/lib/auth/oauth-continue"

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale: locale as Locale, namespace: "auth.meta" })
  return { title: t("consent"), robots: { index: false } }
}

/** The consent page's line for each scope (auth.consent.scopes); ones not listed aren't shown. */
const SCOPE_MESSAGES = {
  "account:read": "accountRead",
  "places:submit": "placesSubmit",
  offline_access: "offlineAccess",
} as const
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
  if (!session) {
    // The authorize endpoint is an API route, so it has no language prefix.
    const authorize = authorizeContinuation(params)
    if (authorize) redirect(authorize)
    return localizedRedirect({ href: "/login", locale: await getLocale() })
  }
  const [client, profile] = await Promise.all([getConsentClient(params), getProfile(session.user.id)])
  const t = await getTranslations("auth.consent")
  if (!client || !profile) {
    return (
      <AuthPage>
        <p role="alert" className="text-center text-body text-foreground">
          {t("invalid")}
        </p>
      </AuthPage>
    )
  }
  const scopes = (one(query.scope) ?? "").split(" ")
  const permissions = Object.entries(SCOPE_MESSAGES)
    .filter(([s]) => scopes.includes(s))
    .map(([, key]) => t(`scopes.${key}`))
  return (
    <AuthPage>
      <ConsentForm client={client} username={profile.username ?? t("you")} permissions={permissions.length ? permissions : [t("scopes.none")]} />
    </AuthPage>
  )
}
