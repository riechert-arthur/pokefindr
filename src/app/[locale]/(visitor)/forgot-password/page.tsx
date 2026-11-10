import { AuthPage } from "@/components/forms/AuthPage"
import { ForgotPasswordForm } from "@/components/forms/ForgotPasswordForm"
import { setPageLocale, type LocaleParams } from "@/i18n/static"

export const metadata = { title: "Reset your password" }

export default async function ForgotPasswordPage({ params }: LocaleParams) {
  await setPageLocale(params)
  return (
    <AuthPage>
      <ForgotPasswordForm />
    </AuthPage>
  )
}
