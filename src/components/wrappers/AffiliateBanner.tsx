"use client"

import React, { memo } from "react"
import { useAdContext } from "@/components/providers/AdContextProvider"
import { publicConfig } from "@/config.public"

const AffiliateBanner: React.FC = () => {
  const { showBanner, setShowBanner } = useAdContext()
  if (!showBanner) return null

  const isProd = process.env.NODE_ENV === "production"
  const {
    pixelTrackingUrl: pixelTrackingURL,
    link: affiliateLink,
    image: imageLink,
  } = publicConfig.affiliate

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
          bottom-4          /* flush to bottom */
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
            alt="Sponsored Ad for TCGPlayer 10% Off Qualifying Purchases"
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
