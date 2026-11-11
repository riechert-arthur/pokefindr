import { AuthPage } from "@/components/forms/AuthPage"
import { ForgotPasswordForm } from "@/components/forms/ForgotPasswordForm"
import type { Metadata } from "next"
import type { Locale } from "@/i18n/routing"
import { getTranslations } from "next-intl/server"
import { noindex } from "@/i18n/seo"
import { setPageLocale, type LocaleParams } from "@/i18n/static"

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale: locale as Locale, namespace: "auth.meta" })
  // A step of an account flow, not a page to find in search (#255).
  return { title: t("forgotPassword"), robots: noindex(locale) }
}

export default async function ForgotPasswordPage({ params }: LocaleParams) {
  await setPageLocale(params)
  return (
    <AuthPage>
      <ForgotPasswordForm />
    </AuthPage>
  )
}
