import { AuthPage } from "@/components/forms/AuthPage"
import { RegistrationForm } from "@/components/forms/SignupForm"
import { oauthProviders } from "@/server/auth/providers"
import { getServerConfig } from "@/server/config"
import { localeMetadata } from "@/i18n/seo"

/** Its address in each language, for search engines (#183). */
export const generateMetadata = localeMetadata("/signup")

export const dynamic = "force-dynamic"

export default function SignupPage() {
  return (
    <AuthPage>
      <RegistrationForm providers={oauthProviders(getServerConfig())} />
    </AuthPage>
  )
}
