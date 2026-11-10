import { Link } from "@/i18n/navigation"
import { buttonVariants } from "@/components/ui/button"
import { getTranslations } from "next-intl/server"
import { setPageLocale, type LocaleParams } from "@/i18n/static"
import { SUPPORT_URL } from "@/lib/links"
import type { Metadata } from "next"

/** Where a confirmation email lands: a step of sign-up, not a page to find in search (#255). */
export const metadata: Metadata = { robots: { index: false } }

export default async function ConfirmEmailPage({ params }: LocaleParams) {
  const locale = await setPageLocale(params)
  const t = await getTranslations({ locale, namespace: "auth.confirm" })
  return (
    <>
      <main className="grid h-screen place-items-center bg-background px-6 py-24 sm:py-32 lg:px-8">
        <div className="text-center">
          <h1 className="mt-4 text-display text-foreground">
            {t("title")}
          </h1>
          <p className="mt-6 max-w-prose text-pretty text-body-lg text-muted-foreground">
            {t("body")}
          </p>
          <div className="mt-10 flex items-center justify-center gap-x-6">
            <Link
              href="/login"
              className={buttonVariants({ size: "lg" })}
            >
              {t("login")}
            </Link>
            <Link href={SUPPORT_URL} className="text-sm font-semibold text-foreground">
              {t("support")} <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>
        </div>
      </main>
    </>
  )
}
