import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { readTokens } from "@/lib/design/tokens"
import { useIsDark, useThemeKey } from "@/lib/design/useThemeKey"

let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  warn.mockRestore()
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
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("--primary is not set"))
  })

  it("warns once about a malformed token", () => {
    document.documentElement.style.setProperty("--ring", ".5 80% 50%")
    readTokens(["ring"])
    readTokens(["ring"])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('--ring is ".5 80% 50%"'))
  })

  it("uses an explicit fallback for every token", () => {
    expect(readTokens(["primary-foreground"], "hsl(0, 0%, 100%)")["primary-foreground"]).toBe("hsl(0, 0%, 100%)")
  })
})

describe("useThemeKey", () => {
  it("changes when the theme class on <html> changes", async () => {
    const { result } = renderHook(() => useThemeKey())
    const before = result.current
    act(() => {
      document.documentElement.classList.add("dark")
    })
    await waitFor(() => expect(result.current).toContain("dark"))
    expect(result.current).not.toBe(before)
  })

  it("ignores inline style changes", async () => {
    const { result } = renderHook(() => useThemeKey())
    const before = result.current
    act(() => {
      document.documentElement.style.overflow = "hidden"
    })
    await new Promise((r) => setTimeout(r, 0))
    expect(result.current).toBe(before)
  })
})

describe("useIsDark", () => {
  it("follows the dark class on <html>", async () => {
    const { result } = renderHook(() => useIsDark())
    expect(result.current).toBe(false)
    act(() => {
      document.documentElement.classList.add("dark")
    })
    await waitFor(() => expect(result.current).toBe(true))
  })
})
