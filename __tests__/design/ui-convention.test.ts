// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, it, expect } from "vitest"

const ROOT = path.resolve(__dirname, "../..")

describe("component folders", () => {
  it("keeps src/components/ui to shadcn registry files (kebab-case)", () => {
    // Files and folders, any depth: shadcn components can ship .ts helpers or hooks.
    const bad: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const kebab = /^[a-z0-9]+(-[a-z0-9]+)*$/
        if (entry.isDirectory()) {
          if (!kebab.test(entry.name)) bad.push(entry.name)
          walk(path.join(dir, entry.name))
        } else if (!/^[a-z0-9]+(-[a-z0-9]+)*\.tsx?$/.test(entry.name)) {
          bad.push(entry.name)
        }
      }
    }
    walk(path.join(ROOT, "src/components/ui"))
    expect(bad).toEqual([])
  })

  it("keeps PokeFindr components in src/components/pokefindr (PascalCase)", () => {
    // PascalCase components and folders; camelCase .ts helpers and hooks (useUserMenu.ts, index.ts).
    const bad: string[] = []
    let components = 0
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (!/^[A-Z][A-Za-z0-9]*$/.test(entry.name)) bad.push(entry.name)
          walk(path.join(dir, entry.name))
        } else if (/^[A-Z][A-Za-z0-9]*\.tsx$/.test(entry.name)) {
          components++
        } else if (!/^[a-z][A-Za-z0-9]*\.ts$/.test(entry.name)) {
          bad.push(entry.name)
        }
      }
    }
    walk(path.join(ROOT, "src/components/pokefindr"))
    expect(components).toBeGreaterThan(0)
    expect(bad).toEqual([])
  })
})

describe("avatars", () => {
  // UserAvatar (src/components/pokefindr/UserAvatar.tsx) is the only way to show a
  // person (docs/design-system.md), so hand-made initials don't drift apart again.
  const ALLOWED = new Set(["src/components/ui/avatar.tsx", "src/components/pokefindr/UserAvatar.tsx"])
  const files: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`
      if (entry.isDirectory()) walk(rel)
      else if (/\.tsx?$/.test(entry.name) && !ALLOWED.has(rel)) files.push(rel)
    }
  }
  walk("src/components")
  walk("src/app")

  // An initial taken from a name: username.charAt(0), userName.slice(0, 1), user.name[0],
  // displayName?.[0], user.name.at(0). Not any `name`: LanguageSwitcher capitalizes language names.
  const HAND_MADE_INITIAL =
    /\b(?:user_?name|display_?name|user\??\.name)(?:\?\.|\.)?(?:charAt\(0\)|slice\(0,\s*1\)|substring\(0,\s*1\)|at\(0\)|\[0\])/i

  it("recognizes hand-made initials", () => {
    for (const code of [
      "username.charAt(0)",
      "userName.slice(0, 1)",
      "user.name[0]",
      "r.username[0]",
      "session.username?.[0]",
      "displayName.substring(0, 1)",
      "user.name.at(0)",
      "session.user?.name.charAt(0)",
      "user_name?.charAt(0)",
    ]) {
      expect(HAND_MADE_INITIAL.test(code), code).toBe(true)
    }
    for (const code of ["names[0]", "filename[0]", "username.length", "username.charAt(1)", "name.charAt(0)"]) {
      expect(HAND_MADE_INITIAL.test(code), code).toBe(false)
    }
  })

  it("draws avatar placeholders only in UserAvatar", () => {
    const bad = files.filter((f) => {
      const code = readFileSync(path.join(ROOT, f), "utf8")
      return /\bAvatar(Fallback|Image)\b/.test(code) || HAND_MADE_INITIAL.test(code)
    })
    expect(bad).toEqual([])
  })
})
