import { AuthPage } from "@/components/forms/AuthPage"
import { ResetPasswordForm } from "@/components/forms/ResetPasswordForm"
import type { Metadata } from "next"
import type { Locale } from "@/i18n/routing"
import { getTranslations } from "next-intl/server"
import { noindex } from "@/i18n/seo"
import type { LocaleParams } from "@/i18n/static"

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale: locale as Locale, namespace: "auth.meta" })
  // A step of an account flow, not a page to find in search (#255).
  return { title: t("resetPassword"), robots: noindex(locale) }
}

/** Where a reset link lands: Better Auth adds ?token=, or ?error= when the link is bad or expired. */
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams
  return (
    <AuthPage>
      <ResetPasswordForm token={!error && token ? token : null} />
    </AuthPage>
  )
}
