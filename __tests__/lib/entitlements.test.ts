import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { can, ENTITLEMENTS, entitlementsOf, rolesWith } from "@/lib/auth/entitlements"
import { ROLES } from "@/lib/auth/roles"

describe("entitlements", () => {
  // The whole permission table. A change here is a change to who can do
  // what, so it should show up in review as a diff of this snapshot.
  it("gives each role exactly these", () => {
    expect(Object.fromEntries(ROLES.map((r) => [r, entitlementsOf(r)]))).toEqual({
      member: [],
      moderator: ["moderation.view", "moderation.decide", "moderation.notify", "admin.open"],
      admin: [
        "moderation.view",
        "moderation.decide",
        "moderation.decideOwn",
        "moderation.notify",
        "admin.open",
        "admin.summary.all",
        "admin.coverage",
        "admin.vending",
        "admin.jobs",
        "admin.ads",
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
    expect(rolesWith("moderation.notify")).toEqual(["moderator", "admin"])
  })
})

describe("access decisions", () => {
  const SRC = path.resolve(__dirname, "../../src")
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = path.join(dir, f)
      return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : []
    })
  // A role compared by name, e.g. `role === "admin"` or `profiles.role, ["moderator", …]`.
  const ROLE_CHECK = /\brole\s*[!=]==\s*["'](member|moderator|admin)["']|["'](member|moderator|admin)["']\s*[!=]==\s*\w*role\b|\.role\s*,\s*\[/

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
