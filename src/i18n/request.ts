import { hasLocale } from "next-intl"
import { getRequestConfig } from "next-intl/server"
import { loadMessages } from "./messages"
import { routing } from "./routing"

/** The language and messages for each request (next-intl reads this through the plugin in next.config.ts). */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale
  return { locale, messages: await loadMessages(locale) }
})
