import { describe, expect, it } from "vitest"
import { cn } from "@/lib/utils"
import tailwindConfig from "../../tailwind.config"

describe("cn", () => {
  it("lets the later class win a conflict", () => {
    expect(cn("rounded-full", "rounded-lg")).toBe("rounded-lg")
    expect(cn("px-2.5 py-0.5", "px-2")).toBe("py-0.5 px-2")
  })

  it("keeps a custom text size next to a text color", () => {
    expect(cn("text-body", "text-foreground")).toBe("text-body text-foreground")
    expect(cn("text-caption text-muted-foreground", "text-overline")).toBe("text-muted-foreground text-overline")
  })

  it("drops falsy values", () => {
    expect(cn("a", undefined, false, null, "b")).toBe("a b")
  })

  it("knows every custom text size in tailwind.config.ts", () => {
    const sizes = Object.keys(tailwindConfig.theme?.extend?.fontSize ?? {})
    expect(sizes.length).toBeGreaterThan(0)
    for (const size of sizes) expect(cn(`text-${size}`, "text-foreground"), size).toBe(`text-${size} text-foreground`)
  })
})
