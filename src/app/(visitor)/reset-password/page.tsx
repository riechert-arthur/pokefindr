import { AuthPage } from "@/components/forms/AuthPage"
import { ResetPasswordForm } from "@/components/forms/ResetPasswordForm"

export const metadata = { title: "Choose a new password" }

/** Where a reset link lands: Better Auth adds ?token=, or ?error= when the link is bad or expired. */
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams
  return (
    <AuthPage>
      <ResetPasswordForm token={!error && token ? token : null} />
    </AuthPage>
  )
}
