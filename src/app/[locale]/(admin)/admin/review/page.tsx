import { redirect } from "@/i18n/navigation"
import { setPageLocale, type LocaleParams } from "@/i18n/static"

/** The review queue's old address (R4): now a section of /admin. */
export default async function ReviewQueueRedirect({ params }: LocaleParams) {
  redirect({ href: "/admin", locale: await setPageLocale(params) })
}
