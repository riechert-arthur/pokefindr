import { redirect } from "@/i18n/navigation"
import { setPageLocale, type LocaleParams } from "@/i18n/static"

/** The review queue's old address (R4): now the first tab of /moderate (#293), for moderators and admins alike. */
export default async function ReviewQueueRedirect({ params }: LocaleParams) {
  redirect({ href: "/moderate", locale: await setPageLocale(params) })
}
