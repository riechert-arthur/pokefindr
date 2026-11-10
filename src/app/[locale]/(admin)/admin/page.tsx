import type { Metadata } from "next"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { AdminApp } from "@/components/admin/AdminApp"
import { staffRole } from "@/server/admin/access"
import { getProfile } from "@/server/services/users"

export const metadata: Metadata = { title: "Admin · PokeFindr", robots: { index: false } }
export const dynamic = "force-dynamic"

/**
 * /admin (#152). Middleware sends people without a session to log in; for
 * anyone signed in who isn't a moderator or admin the page doesn't exist.
 */
export default async function AdminPage() {
  const userId = (await headers()).get("x-user-id")
  const role = await staffRole(userId)
  if (!role) notFound()
  const profile = await getProfile(userId!)
  return <AdminApp role={role} username={profile?.username ?? "admin"} />
}
