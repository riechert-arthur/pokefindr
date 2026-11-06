/**
 * Browser-safe configuration. Only `NEXT_PUBLIC_*` values belong here.
 *
 * Each variable must be referenced literally (`process.env.NEXT_PUBLIC_X`)
 * so Next.js can inline it into the client bundle at build time.
 */
export const publicConfig = {
  mapboxAccessToken: process.env.NEXT_PUBLIC_MAPBOXGL_API_KEY ?? "",
  mapboxGeocodingToken: process.env.NEXT_PUBLIC_MAPBOX_GEOCODING_API_KEY ?? "",
  // Left undefined when unset, so the banner omits `src`/`href` instead of
  // rendering empty strings.
  affiliate: {
    pixelTrackingUrl: process.env.NEXT_PUBLIC_PIXEL_TRACKING_URL_1,
    link: process.env.NEXT_PUBLIC_AFFILIATE_LINK_1,
    image: process.env.NEXT_PUBLIC_IMAGE_1,
  },
} as const
