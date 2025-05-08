import React from "react"
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { render, fireEvent, screen, cleanup } from "@testing-library/react"

async function renderBanner() {
  vi.resetModules()

  vi.stubEnv("NEXT_PUBLIC_AFFILIATE_LINK_1",     "https://example.com")
  vi.stubEnv("NEXT_PUBLIC_IMAGE_1",              "https://example.com/ad.png")
  vi.stubEnv("NEXT_PUBLIC_PIXEL_TRACKING_URL_1", "https://pixel.example.com/track")

  const [{ AdContextProvider }, { default: AffiliateBanner }] = await Promise.all([
    import("@/components/providers/AdContextProvider"),
    import("@/components/AffiliateBanner"),
  ])

  return render(
    <AdContextProvider>
      <AffiliateBanner />
    </AdContextProvider>
  )
}

describe("AffiliateBanner Component", () => {
  afterEach(() => {
    vi.resetAllMocks()
    vi.stubEnv("NODE_ENV", undefined)
    cleanup()
  })

  it("renders banner and close button by default", async () => {
    vi.stubEnv("NODE_ENV", "development")

    await renderBanner()

    const closeBtn = screen.getByLabelText("Close ad")
    expect(closeBtn).toBeTruthy()

    const link = screen.getByRole("link", { name: /Sponsored Ad/i })
    expect(link).toBeInTheDocument()
  })

  it("hides the banner when close button is clicked", async () => {
    await renderBanner()

    const closeBtn = screen.getByLabelText("Close ad")
    fireEvent.click(closeBtn)

    expect(screen.queryByRole("link")).toBeNull()
  })

  it("shows the tracking pixel only in production mode", async () => {
    vi.stubEnv("NODE_ENV", "production")
    const { container } = await renderBanner()

    const pixelImg = container.querySelector('img[width="0"][height="0"]')
    expect(pixelImg).toBeInTheDocument()

    vi.stubEnv("NODE_ENV", "development")
    const { container: devContainer } = await renderBanner()
    const absentPixel = devContainer.querySelector('img[width="0"][height="0"]')
    expect(absentPixel).toBeNull()
  })
})
