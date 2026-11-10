import { AuthPage } from "@/components/forms/AuthPage"
import { RegistrationForm } from "@/components/forms/SignupForm"
import { oauthProviders } from "@/server/auth/providers"
import { getServerConfig } from "@/server/config"
import { getTranslations } from "next-intl/server"
import type { Metadata } from "next"
import { pageMetadata } from "@/i18n/seo"
import type { Locale } from "@/i18n/routing"
import type { LocaleParams } from "@/i18n/static"

/** Its title, description and address in each language, for search engines (#183, #255). */
export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = (await params).locale as Locale
  const t = await getTranslations({ locale, namespace: "auth.meta" })
  return pageMetadata("/signup", locale, { title: t("signup"), description: t("signupDescription") })
}

export const dynamic = "force-dynamic"

export default function SignupPage() {
  return (
    <AuthPage>
      <RegistrationForm providers={oauthProviders(getServerConfig())} />
    </AuthPage>
  )
}
