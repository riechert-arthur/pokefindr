import { AuthPage } from "@/components/forms/AuthPage"
import { RegistrationForm } from "@/components/forms/SignupForm"
import { oauthProviders } from "@/server/auth/providers"
import { getServerConfig } from "@/server/config"

export const dynamic = "force-dynamic"

export default function SignupPage() {
  return (
    <AuthPage>
      <RegistrationForm providers={oauthProviders(getServerConfig())} />
    </AuthPage>
  )
}
