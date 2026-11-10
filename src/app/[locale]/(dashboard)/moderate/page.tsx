import type { Metadata } from "next"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { ModerateDashboard } from "@/components/moderate/ModerateDashboard"
import { can } from "@/lib/auth/entitlements"
import { roleOf } from "@/server/admin/access"
import { setPageLocale, type LocaleParams } from "@/i18n/static"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const t = await getTranslations({ locale: await setPageLocale(params), namespace: "moderate" })
  return { title: `${t("title")} · PokeFindr`, robots: { index: false } }
}

/**
 * /moderate (#293): moderators' dashboard, in the app layout. Middleware
 * sends people without a session to log in; for anyone signed in without
 * `moderation.view` the page doesn't exist.
 */
export default async function ModeratePage({ params }: LocaleParams) {
  await setPageLocale(params)
  const role = await roleOf((await headers()).get("x-user-id"))
  if (!role || !can(role, "moderation.view")) notFound()
  return <ModerateDashboard role={role} />
}
