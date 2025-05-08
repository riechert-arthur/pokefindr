"use client"

import React, { useState, memo } from "react"

const AffiliateBanner: React.FC = () => {
  const [isVisible, setIsVisible] = useState(true)
  if (!isVisible) return null

  const isProd = process.env.NODE_ENV === "production"
  const pixelTrackingURL = process.env.NEXT_PUBLIC_PIXEL_TRACKING_URL_1
  const affiliateLink = process.env.NEXT_PUBLIC_AFFILIATE_LINK_1
  const imageLink = process.env.NEXT_PUBLIC_IMAGE_1

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
          bg-white/90
          backdrop-blur-sm
          rounded-2xl
          shadow-xl
          max-w-[90vw]
          sm:max-w-lg
          z-50
          hover:scale-105
          ease-out
          duration-200
          transition-transform
        "
      >
        <button
          onClick={() => setIsVisible(false)}
          aria-label="Close ad"
          className="
            absolute
            top-1
            left-2
            text-black
            hover:text-gray-900
            text-2xl
            leading-none
            z-1000
            focus:outline-none
            hover:scale-110
            ease-out
            duration-200
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
