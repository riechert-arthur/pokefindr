import type { Messages } from "./messages"
import type { Locale } from "./routing"

// Typed keys and locales: t("map.status.inView") fails typecheck if the key
// isn't in messages/en.yml.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale
    Messages: Messages
  }
}
