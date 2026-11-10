import type { ReactNode } from "react"
import { useTranslations } from "next-intl"
import { Link } from "@/i18n/navigation"
import { buttonVariants } from "@/components/ui/button"

import { SUPPORT_URL } from "@/lib/links"

/** The 404 and error pages: a code, a title, a line of text, and the way home. */
export function ErrorPage({ code, title, children }: { code: string; title: string; children?: ReactNode }) {
  const t = useTranslations("errors")
  return (
    <div className="grid min-h-full place-items-center bg-background px-6 py-24 sm:py-32 lg:px-8">
      <div className="text-center">
        <p className="text-base font-semibold text-primary">{code}</p>
        <h1 className="mt-4 text-display text-foreground">{title}</h1>
        {children && <p className="mt-6 text-pretty text-body-lg text-muted-foreground">{children}</p>}
        <div className="mt-10 flex items-center justify-center gap-x-6">
          <Link href="/" className={buttonVariants({ size: "lg" })}>
            {t("home")}
          </Link>
          <a href={SUPPORT_URL} target="_top" className="text-sm font-semibold text-foreground">
            {t("support")} <span aria-hidden="true">&rarr;</span>
          </a>
        </div>
      </div>
    </div>
  )
}

/** The 404 page's content, in the request's language. */
export function NotFoundContent() {
  const t = useTranslations("errors.notFound")
  return (
    <ErrorPage code={t("code")} title={t("title")}>
      {t("body")}
    </ErrorPage>
  )
}
