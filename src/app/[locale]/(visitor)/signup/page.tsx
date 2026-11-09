import { AuthPage } from "@/components/forms/AuthPage"
import { RegistrationForm } from "@/components/forms/SignupForm"
import { oauthProviders } from "@/server/auth/providers"
import { getServerConfig } from "@/server/config"
import { pageMetadata } from "@/i18n/seo"
import type { Metadata } from "next"
import type { Locale } from "@/i18n/routing"
import type { LocaleParams } from "@/i18n/static"

/** Its address in each language, for search engines (#183). */
export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  return pageMetadata("/signup", (await params).locale as Locale)
}


export const dynamic = "force-dynamic"

export default function SignupPage() {
  return (
    <AuthPage>
      <RegistrationForm providers={oauthProviders(getServerConfig())} />
    </AuthPage>
  )
}
