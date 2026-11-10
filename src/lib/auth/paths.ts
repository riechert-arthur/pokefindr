import { DEFAULT_LOCALE, type Locale } from "@/i18n/routing"

/** Where a confirmation link lands once Better Auth has confirmed the email. */
export const VERIFIED_CALLBACK = "/login?verified=1"

/** Where both email-change links land (approve from the old address, confirm from the new). */
export const EMAIL_CHANGE_CALLBACK = "/settings?email=link"

/** A callback path in the page's language (/es/login?verified=1), so the link in a Spanish email lands on the Spanish page. */
export const localizedCallback = (path: string, locale: Locale): string => (locale === DEFAULT_LOCALE ? path : `/${locale}${path}`)
