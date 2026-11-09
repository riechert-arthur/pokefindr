"use client"

import React, { memo } from "react"
import { usePathname } from "next/navigation"
import { useAdContext } from "@/components/providers/AdContextProvider"
import { BANNERS } from "@/config/banners"

const AffiliateBanner: React.FC = () => {
  const { showBanner, setShowBanner } = useAdContext()
  const pathname = usePathname()
  // The prototype's rule: the assistant never shows ads (and it would cover the composer).
  if (!showBanner || pathname === "/home") return null

  const isProd = process.env.NODE_ENV === "production"
  // The floating banner shows the first banner with an image (#59); in-content slots replace it in #136.
  const banner = BANNERS.find((b) => b.href && b.image)
  if (!banner) return null
  const { pixel: pixelTrackingURL, href: affiliateLink, image: imageLink } = banner

  return (
    <>
      {isProd && (
        <img
          src={pixelTrackingURL}
          width={0}
          height={0}
          alt=""
          className="absolute invisible"
        />
      )}

      <div
        className="
          fixed
          bottom-[var(--banner-bottom,1rem)]  /* above the phone tab bar when it's shown */
          left-1/2
          transform -translate-x-1/2
          bg-card/90
          backdrop-blur-sm
          rounded-2xl
          shadow-xl
          max-w-[95vw]
          z-40
          hover:scale-105
          ease-out
          duration-200
          transition-transform
          w-full
          md:w-2/5
        "
      >
        <button
          onClick={() => setShowBanner(false)}
          aria-label="Close ad"
          className="
            absolute
            top-0.5
            left-1
            grid
            size-6
            place-items-center
            text-muted-foreground
            hover:text-foreground
            text-2xl
            leading-none
            z-1000
            focus:outline-none
            hover:scale-110
            ease-out
            duration-200
            max-w-1/6
          "
        >
          &times;
        </button>
        <a
          rel="nofollow sponsored"
          href={affiliateLink}
          target="_top"
          id="2952289"
          className="block"
        >
          <img
            src={imageLink}
            alt={[`Sponsored: ${banner.sponsor}.`, banner.title, banner.body].filter(Boolean).join(" ")}
            width={1500}
            height={300}
            className="
              block
              max-w-full
              h-auto
              rounded-lg
              shadow-lg
              z-10
            "
          />
        </a>
      </div>
    </>
  )
}

export default memo(AffiliateBanner)
