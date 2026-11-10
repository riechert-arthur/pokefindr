import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { UserAvatar, avatarInitial } from "@/components/pokefindr/UserAvatar"

/**
 * jsdom never loads images, so Radix's Avatar would wait forever. This stand-in
 * "loads" any URL except ones containing "broken", which fail.
 */
class FakeImage extends EventTarget {
  complete = false
  naturalWidth = 0
  crossOrigin: string | null = null
  referrerPolicy = ""
  #src = ""
  get src() {
    return this.#src
  }
  set src(value: string) {
    this.#src = value
    setTimeout(() => {
      this.complete = true
      const ok = !value.includes("broken")
      this.naturalWidth = ok ? 256 : 0
      this.dispatchEvent(new Event(ok ? "load" : "error"))
    })
  }
}

describe("avatarInitial", () => {
  it.each([
    ["misty", "M"],
    ["  brock", "B"],
    ["élodie", "É"],
    ["ゆい", "ゆ"],
    ["E\u0301lodie", "É"],
    ["ßenta", "ß"],
    ["ﬁona", "ﬁ"],
    ["_ash_", null],
    ["🔥blaine", null],
    ["42", null],
    ["", null],
    [null, null],
  ])("%j → %j", (name, initial) => {
    expect(avatarInitial(name)).toBe(initial)
  })
})

describe("UserAvatar", () => {
  beforeEach(() => vi.stubGlobal("Image", FakeImage))
  afterEach(() => vi.unstubAllGlobals())

  it("shows the uppercased first letter, hidden from screen readers", () => {
    const { container } = render(<UserAvatar name="misty" />)
    expect(container.textContent).toBe("M")
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true")
  })

  it("shows a person icon for a name that doesn't start with a letter", () => {
    const { container } = render(<UserAvatar name="🔥blaine" />)
    expect(container.textContent).toBe("")
    expect(container.querySelector("svg")).not.toBeNull()
  })

  it("shows the picture once it loads, with an empty alt", async () => {
    const { container } = render(<UserAvatar name="misty" imageUrl="/misty.webp" />)
    // The initial shows while it loads.
    expect(container.textContent).toBe("M")
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull())
    expect(container.querySelector("img")).toHaveAttribute("alt", "")
    expect(container.textContent).toBe("")
  })

  it("keeps the initial when the picture fails to load", async () => {
    const { container } = render(<UserAvatar name="misty" imageUrl="/broken.webp" />)
    await new Promise((r) => setTimeout(r, 10))
    expect(container.querySelector("img")).toBeNull()
    expect(screen.queryByText("M")).not.toBeNull()
  })

  it("uses a type token for each size, never a raw text size", () => {
    for (const size of ["xs", "sm", "md", "lg"] as const) {
      const { container, unmount } = render(<UserAvatar name="misty" size={size} />)
      const fallback = container.querySelector("span span")!
      expect(fallback.className).toMatch(/text-(overline|caption|subheading|title)/)
      expect(fallback.className).not.toMatch(/text-(xs|sm|base|lg|xl)\b/)
      unmount()
    }
  })
})
