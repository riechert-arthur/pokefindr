import { afterEach, describe, expect, it } from "vitest"
import { renderHook } from "@testing-library/react"
import { DARK_THEMES, THEMES, lightOrDark } from "@/lib/design/themes"
import { useIsDark } from "@/lib/design/useThemeKey"

afterEach(() => {
  document.documentElement.className = ""
})

describe("themes (#371)", () => {
  it("has Holo Light and Holo Dark beside Light and Dark, with the dark ones marked", () => {
    expect(THEMES).toEqual(["light", "dark", "holo-light", "holo-dark"])
    expect(DARK_THEMES).toEqual(["dark", "holo-dark"])
  })

  it("tells light from dark for what only knows those two", () => {
    expect(lightOrDark("holo-dark")).toBe("dark")
    expect(lightOrDark("holo-light")).toBe("light")
    expect(lightOrDark("dark")).toBe("dark")
    expect(lightOrDark("system")).toBeUndefined()
    expect(lightOrDark(undefined)).toBeUndefined()
  })

  it.each([
    ["dark", true],
    ["holo-dark", true],
    ["light", false],
    ["holo-light", false],
  ])("counts the %s class on <html> as dark: %s", (theme, dark) => {
    document.documentElement.className = theme
    expect(renderHook(() => useIsDark()).result.current).toBe(dark)
  })
})
