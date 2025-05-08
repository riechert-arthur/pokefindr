import React from "react"
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { render, fireEvent, screen, cleanup } from "@testing-library/react"

async function loadBanner() {
  vi.resetModules()
  const { default: AffiliateBanner } = await import(
    "@/components/AffiliateBanner"
  )
  return AffiliateBanner
}

describe("AffiliateBanner Component", () => {
  beforeEach(() => {
    cleanup()
    vi.stubEnv("NEXT_PUBLIC_AFFILIATE_LINK_1",     "https://example.com");
    vi.stubEnv("NEXT_PUBLIC_IMAGE_1",              "https://example.com/ad.png");
    vi.stubEnv("NEXT_PUBLIC_PIXEL_TRACKING_URL_1", "https://pixel.example.com/track");
  })

  afterEach(() => {
    vi.resetAllMocks()
    vi.stubEnv("NODE_ENV", undefined)
    cleanup()
  })

  it("renders banner and close button by default", async () => {
    vi.stubEnv("NODE_ENV", "development")
    const AffiliateBanner = await loadBanner()

    render(<AffiliateBanner />)

    const closeBtn = screen.getByLabelText("Close ad")
    expect(closeBtn).toBeTruthy()

    const link = screen.getByRole("link", { name: /Sponsored Ad/i })
    expect(link).toBeInTheDocument()
  })

  it("hides the banner when close button is clicked", async () => {
    const AffiliateBanner = await loadBanner()
    render(<AffiliateBanner />)

    const closeBtn = screen.getByLabelText("Close ad")
    fireEvent.click(closeBtn)

    expect(screen.queryByRole("link")).toBeNull()
  })

  it("shows the tracking pixel only in production mode", async () => {
    vi.stubEnv("NODE_ENV", "production")
    const AffiliateBanner = await loadBanner()
    const { container } = render(<AffiliateBanner />)

    const pixelImg = container.querySelector('img[width="0"][height="0"]')
    expect(pixelImg).toBeInTheDocument()

    vi.stubEnv("NODE_ENV", "development")
    const DevBanner = await loadBanner()
    const { container: devContainer } = render(<DevBanner />)
    const absentPixel = devContainer.querySelector('img[width="0"][height="0"]')
    expect(absentPixel).toBeNull()
  })
})
