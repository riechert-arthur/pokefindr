import { AuthPage } from "@/components/forms/AuthPage"
import { ForgotPasswordForm } from "@/components/forms/ForgotPasswordForm"

export const metadata = { title: "Reset your password" }

export default function ForgotPasswordPage() {
  return (
    <AuthPage>
      <ForgotPasswordForm />
    </AuthPage>
  )
}
