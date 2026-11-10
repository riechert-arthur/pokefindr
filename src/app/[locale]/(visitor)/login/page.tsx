import { AuthPage } from "@/components/forms/AuthPage"
import { LoginForm, type LoginNotice } from "@/components/forms/LoginForm"
import { oauthProviders } from "@/server/auth/providers"
import { getServerConfig } from "@/server/config"
import { authorizeContinuation } from "@/lib/auth/oauth-continue"
import { getTranslations } from "next-intl/server"
import type { Metadata } from "next"
import { pageMetadata } from "@/i18n/seo"
import type { Locale } from "@/i18n/routing"
import type { LocaleParams } from "@/i18n/static"

/** Its title, description and address in each language, for search engines (#183, #255). */
export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = (await params).locale as Locale
  const t = await getTranslations({ locale, namespace: "auth.meta" })
  return pageMetadata("/login", locale, { title: t("login"), description: t("loginDescription") })
}

/**
 * A confirmation link lands here with ?verified=1, or with ?error= when it
 * was bad or expired. A failed Google or Discord sign-in comes back with
 * ?oauth=failed. An MCP client connecting to an account (#134) sends people
 * here with its signed authorization request; after logging in they go back
 * to it.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams
  const { verified, error, oauth } = query
  const next = authorizeContinuation(query)
  const notice: LoginNotice | null = oauth ? "oauth-failed" : next ? "connect-app" : error ? "link-expired" : verified ? "verified" : null
  return (
    <AuthPage>
      <LoginForm notice={notice} providers={oauthProviders(getServerConfig())} next={next} />
    </AuthPage>
  )
}
