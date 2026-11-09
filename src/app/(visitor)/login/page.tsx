import { AuthPage } from "@/components/forms/AuthPage"
import { LoginForm, type LoginNotice } from "@/components/forms/LoginForm"
import { oauthProviders } from "@/server/auth/providers"
import { getServerConfig } from "@/server/config"

/**
 * A confirmation link lands here with ?verified=1, or with ?error= when it
 * was bad or expired. A failed Google or Discord sign-in comes back with
 * ?oauth=failed.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ verified?: string; error?: string; oauth?: string }> }) {
  const { verified, error, oauth } = await searchParams
  const notice: LoginNotice | null = oauth ? "oauth-failed" : error ? "link-expired" : verified ? "verified" : null
  return (
    <AuthPage>
      <LoginForm notice={notice} providers={oauthProviders(getServerConfig())} />
    </AuthPage>
  )
}
