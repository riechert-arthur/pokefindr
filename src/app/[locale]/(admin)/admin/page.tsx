import type { Metadata } from "next"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { AdminApp } from "@/components/admin/AdminApp"
import { groupsFor } from "@/lib/admin/sections"
import { can } from "@/lib/auth/entitlements"
import { moderateHref, tabFor } from "@/lib/moderate/tabs"
import { roleOf } from "@/server/admin/access"
import { getProfile } from "@/server/services/users"
import { redirect } from "@/i18n/navigation"
import type { Locale } from "@/i18n/routing"

export const metadata: Metadata = { title: "Admin · PokeFindr", robots: { index: false } }
export const dynamic = "force-dynamic"

/**
 * /admin (#152). Middleware sends people without a session to log in.
 * Moderators work in /moderate (#293), so old emails and bookmarks send them
 * there (to Reports if that's what the link opened); for anyone else without
 * `admin.open` the page doesn't exist.
 */
export default async function AdminPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ section?: string | string[] }> }) {
  const userId = (await headers()).get("x-user-id")
  const role = await roleOf(userId)
  if (!can(role, "admin.open") && can(role, "moderation.view")) {
    const { section } = await searchParams
    redirect({ href: moderateHref(tabFor(section)), locale: (await params).locale as Locale })
  }
  // A role that may open /admin but no section in it gets no page either.
  if (!role || !can(role, "admin.open") || groupsFor(role).length === 0) notFound()
  const profile = await getProfile(userId!)
  return <AdminApp role={role} username={profile?.username ?? "admin"} />
}
