// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { approveEmailChange, confirmEmailChange, escapeHtml, resetPassword, verifyEmail } from "@/server/email/templates"

const url = "https://pokefindr.example/api/identity/verify-email?token=abc&callbackURL=%2Flogin%3Fverified%3D1"

describe("email templates", () => {
  it.each([
    ["verifyEmail", verifyEmail({ name: "Ash", url })],
    ["resetPassword", resetPassword({ name: "Ash", url })],
    ["confirmEmailChange", confirmEmailChange({ name: "Ash", newEmail: "ash@new.example", url })],
    ["approveEmailChange", approveEmailChange({ name: "Ash", newEmail: "ash@new.example", url })],
  ])("%s", (_name, email) => {
    expect(email).toMatchSnapshot()
  })

  it("puts the link in both bodies, escaped in the HTML", () => {
    const email = verifyEmail({ name: "Ash", url })
    expect(email.text).toContain(url)
    expect(email.html).toContain(url.replace(/&/g, "&amp;"))
  })

  it("escapes what people typed", () => {
    const email = confirmEmailChange({ name: "<script>x</script>", newEmail: '"><img src=x>@example.com', url })
    expect(email.html).not.toContain("<script>")
    expect(email.html).not.toContain('"><img')
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;")
  })

  it("greets without a name when there isn't one", () => {
    expect(resetPassword({ name: " ", url }).text.startsWith("Hi,\n")).toBe(true)
  })
})

describe("EMAIL_COLORS", () => {
  /** The light theme's value of a token in globals.css, as hex. */
  const tokenHex = (css: string, token: string) => {
    const light = css.slice(0, css.indexOf(".dark"))
    const m = light.match(new RegExp(`--${token}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`))
    if (!m) throw new Error(`no --${token}`)
    const [h, s, l] = [Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100]
    const f = (n: number) => {
      const k = (n + h / 30) % 12
      const v = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))
      return Math.round(v * 255).toString(16).padStart(2, "0")
    }
    return `#${f(0)}${f(8)}${f(4)}`
  }

  it("match the design tokens", async () => {
    const { readFileSync } = await import("node:fs")
    const { EMAIL_COLORS } = await import("@/server/email/templates")
    const css = readFileSync("src/app/globals.css", "utf8")
    const tokens = { fg: "foreground", muted: "muted-foreground", border: "border", primary: "primary", onPrimary: "primary-foreground", bg: "muted", card: "card" } as const
    for (const [key, token] of Object.entries(tokens)) expect([key, EMAIL_COLORS[key as keyof typeof tokens]]).toEqual([key, tokenHex(css, token)])
  })
})
