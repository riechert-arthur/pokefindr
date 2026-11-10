import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { ADMIN_SECTIONS, groupsFor } from "@/lib/admin/sections"
import { can, ENTITLEMENTS, entitlementsOf, rolesWith, type Entitlement } from "@/lib/auth/entitlements"
import { ROLES } from "@/lib/auth/roles"

describe("entitlements", () => {
  // The whole permission table. A change here is a change to who can do
  // what, so it should show up in review as a diff of this snapshot.
  it("gives each role exactly these", () => {
    expect(Object.fromEntries(ROLES.map((r) => [r, entitlementsOf(r)]))).toEqual({
      member: [],
      moderator: ["moderation.view", "moderation.decide", "moderation.avatars", "moderation.notify", "admin.open"],
      admin: [
        "moderation.view",
        "moderation.decide",
        "moderation.decideOwn",
        "moderation.avatars",
        "moderation.notify",
        "admin.open",
        "admin.summary.all",
        "admin.coverage",
        "admin.vending",
        "admin.jobs",
        "admin.ads",
      ],
      super_admin: [
        "moderation.view",
        "moderation.decide",
        "moderation.decideOwn",
        "moderation.avatars",
        "moderation.notify",
        "admin.open",
        "admin.summary.all",
        "admin.coverage",
        "admin.vending",
        "admin.jobs",
        "admin.ads",
        "users.manage",
      ],
    })
  })

  it("gives nothing without a role", () => {
    for (const e of Object.keys(ENTITLEMENTS) as (keyof typeof ENTITLEMENTS)[]) {
      expect(can(null, e)).toBe(false)
      expect(can(undefined, e)).toBe(false)
    }
  })

  it("lists only known roles", () => {
    for (const roles of Object.values(ENTITLEMENTS)) for (const r of roles) expect(ROLES).toContain(r)
    expect(rolesWith("moderation.notify")).toEqual(["moderator", "admin", "super_admin"])
  })
})

// Entitlements that only make sense together. Each rule says why; a role that
// breaks one would get a page that can't load or a link that goes nowhere.
describe("entitlements that depend on each other", () => {
  const implies = (a: Entitlement, b: Entitlement) => ROLES.filter((r) => can(r, a) && !can(r, b))

  it("lets everyone who can open /admin open at least one section", () => {
    expect(ROLES.filter((r) => can(r, "admin.open") && groupsFor(r).length === 0)).toEqual([])
  })

  it("lets everyone who can open /admin load its summary (GET /api/admin/summary needs moderation.view)", () => {
    expect(implies("admin.open", "moderation.view")).toEqual([])
  })

  it("lets everyone who sees the admin summary cards open the sections they link to", () => {
    expect(implies("admin.summary.all", "admin.coverage")).toEqual([])
    expect(implies("admin.summary.all", "admin.jobs")).toEqual([])
  })

  it("gives super admins everything admins have", () => {
    expect(entitlementsOf("admin").filter((e) => !can("super_admin", e))).toEqual([])
  })

  it("only lets people who manage users into /admin, where User management lives", () => {
    expect(implies("users.manage", "admin.open")).toEqual([])
  })

  it("only lets people who can decide submissions decide their own", () => {
    expect(implies("moderation.decideOwn", "moderation.decide")).toEqual([])
  })

  it("names a real entitlement on every admin section", () => {
    for (const s of ADMIN_SECTIONS) expect(Object.keys(ENTITLEMENTS)).toContain(s.entitlement)
  })
})

describe("access decisions", () => {
  const SRC = path.resolve(__dirname, "../../src")
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = path.join(dir, f)
      return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : []
    })
  // A role compared by name: `role === "admin"` (or ==, !=, either way round),
  // `["moderator", "admin"].includes(role)`, `case "admin":`, or a role column
  // filtered by anything but rolesWith(), e.g. `inArray(profiles.role, [...])`.
  const NAME = String.raw`["'](?:member|moderator|admin|super_admin)["']`
  const ROLE_CHECK = new RegExp(
    [
      String.raw`\brole\??\s*[!=]==?\s*${NAME}`,
      String.raw`${NAME}\s*[!=]==?\s*[\w?.]*role\b`,
      String.raw`\[\s*${NAME}[^\]]*\]\s*\.includes\(\s*[\w?.]*role\b`,
      String.raw`\bcase\s+${NAME}\s*:`,
      String.raw`inArray\(\s*[\w.]*\.role\s*,(?!\s*rolesWith\()`,
    ].join("|"),
  )

  it("are recognized by the guard below", () => {
    for (const bad of [
      `role === "admin"`,
      `session?.role !== "admin"`,
      `role == 'moderator'`,
      `"admin" === user.role`,
      `["moderator", "admin"].includes(role)`,
      `case "admin":`,
      `inArray(profiles.role, ["moderator", "admin"])`,
      `inArray(profiles.role, staff)`,
    ])
      expect(bad).toMatch(ROLE_CHECK)
    for (const fine of [`inArray(profiles.role, rolesWith("moderation.notify"))`, `can(role, "admin.jobs")`, `role: "admin"`, `ROLES = ["member", "moderator", "admin"]`])
      expect(fine).not.toMatch(ROLE_CHECK)
  })

  it("are made in src/lib/auth/entitlements.ts, not by comparing role names", () => {
    const offenders = files(SRC)
      .filter((f) => !f.endsWith(path.join("lib", "auth", "entitlements.ts")))
      .flatMap((f) =>
        readFileSync(f, "utf8")
          .split("\n")
          .map((line, i) => ({ line, at: `${path.relative(SRC, f)}:${i + 1}` }))
          .filter(({ line }) => ROLE_CHECK.test(line))
          .map(({ at, line }) => `${at}  ${line.trim()}`),
      )
    expect(offenders).toEqual([])
  })
})
