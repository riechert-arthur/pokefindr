import { AuthPage } from "@/components/forms/AuthPage"
import { LoginForm, type LoginNotice } from "@/components/forms/LoginForm"

/** A confirmation link lands here with ?verified=1, or with ?error= when it was bad or expired. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ verified?: string; error?: string }> }) {
  const { verified, error } = await searchParams
  const notice: LoginNotice | null = error ? "link-expired" : verified ? "verified" : null
  return (
    <AuthPage>
      <LoginForm notice={notice} />
    </AuthPage>
  )
}
