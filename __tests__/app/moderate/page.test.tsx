// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Role } from "@/lib/auth/roles"

vi.mock("server-only", () => ({}))
const who = vi.hoisted(() => ({ role: null as Role | null }))
vi.mock("next/headers", () => ({ headers: async () => new Headers(who.role ? { "x-user-id": "u1" } : {}) }))
vi.mock("@/server/admin/access", () => ({ roleOf: async (id: string | null) => (id ? who.role : null) }))
vi.mock("@/server/services/users", () => ({ getProfile: async () => ({ username: "dev" }) }))
vi.mock("next-intl/server", () => ({ setRequestLocale: () => {}, getTranslations: async () => (k: string) => k }))
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT FOUND")
  },
}))
const redirect = vi.fn(({ href, locale }: { href: string; locale: string }) => {
  throw new Error(`REDIRECT ${locale} ${href}`)
})
vi.mock("@/i18n/navigation", () => ({ redirect: (to: { href: string; locale: string }) => redirect(to) }))
vi.mock("@/components/moderate/ModerateDashboard", () => ({ ModerateDashboard: () => "moderate" }))
vi.mock("@/components/admin/AdminApp", () => ({ AdminApp: () => "admin" }))

import ModeratePage from "@/app/[locale]/(dashboard)/moderate/page"
import AdminPage from "@/app/[locale]/(admin)/admin/page"
import ReviewRedirect from "@/app/[locale]/(admin)/admin/review/page"

const params = (locale = "en") => Promise.resolve({ locale })
const moderate = (role: Role | null) => {
  who.role = role
  return ModeratePage({ params: params() })
}
const admin = (role: Role | null, section?: string, locale = "en") => {
  who.role = role
  return AdminPage({ params: params(locale), searchParams: Promise.resolve(section ? { section } : {}) })
}

beforeEach(() => {
  redirect.mockClear()
})

describe("/moderate", () => {
  it("doesn't exist for visitors and members", async () => {
    await expect(moderate(null)).rejects.toThrow("NOT FOUND")
    await expect(moderate("member")).rejects.toThrow("NOT FOUND")
  })

  it.each<Role>(["moderator", "admin", "super_admin"])("opens for a %s", async (role) => {
    const page = (await moderate(role)) as { type: unknown; props: { role: Role } }
    expect(page.type).toBeTypeOf("function")
    expect(page.props.role).toBe(role)
  })
})

describe("/admin", () => {
  it("sends moderators to /moderate, in their language, keeping Reports and Reviews", async () => {
    await expect(admin("moderator")).rejects.toThrow("REDIRECT en /moderate")
    await expect(admin("moderator", "reports", "es")).rejects.toThrow("REDIRECT es /moderate?tab=reports")
    await expect(admin("moderator", "reviews")).rejects.toThrow("REDIRECT en /moderate?tab=reviews")
    await expect(admin("moderator", "jobs")).rejects.toThrow("REDIRECT en /moderate")
  })

  it("opens for admins and doesn't exist for members", async () => {
    expect(await admin("admin")).toBeTruthy()
    expect(redirect).not.toHaveBeenCalled()
    await expect(admin("member")).rejects.toThrow("NOT FOUND")
    await expect(admin(null)).rejects.toThrow("NOT FOUND")
  })

  it("sends the old review queue address to /moderate", async () => {
    await expect(ReviewRedirect({ params: params("es") })).rejects.toThrow("REDIRECT es /moderate")
  })
})
