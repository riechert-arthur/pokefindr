import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { readTokens } from "@/lib/design/tokens"
import { useThemeKey } from "@/lib/design/useThemeKey"

afterEach(() => {
  document.documentElement.className = ""
  document.documentElement.removeAttribute("style")
})

describe("readTokens", () => {
  it("reads a token as an hsl() color", () => {
    document.documentElement.style.setProperty("--primary", "221.2 83.2% 53.3%")
    expect(readTokens(["primary"]).primary).toBe("hsl(221.2, 83.2%, 53.3%)")
  })

  it("falls back to black for text tokens and gray for fills, so text stays readable", () => {
    const c = readTokens(["primary", "primary-foreground", "foreground"])
    expect(c.primary).toBe("hsl(0, 0%, 50%)")
    expect(c["primary-foreground"]).toBe("hsl(0, 0%, 0%)")
    expect(c.foreground).toBe("hsl(0, 0%, 0%)")
  })

  it("uses an explicit fallback for every token", () => {
    expect(readTokens(["primary-foreground"], "hsl(0, 0%, 100%)")["primary-foreground"]).toBe("hsl(0, 0%, 100%)")
  })
})

describe("useThemeKey", () => {
  it("changes when the theme class on <html> changes", async () => {
    const { result } = renderHook(() => useThemeKey())
    const before = result.current
    await act(async () => {
      document.documentElement.classList.add("dark")
      await Promise.resolve() // let the MutationObserver fire
    })
    expect(result.current).not.toBe(before)
    expect(result.current).toContain("dark")
  })
})
