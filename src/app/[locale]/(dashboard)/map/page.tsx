import type { SearchParams } from "nuqs/server"
import { preconnect } from "react-dom"
import type { Metadata } from "next"
import { getLocale, getTranslations } from "next-intl/server"
import type { Locale } from "@/i18n/routing"
import type { LocaleParams } from "@/i18n/static"
import { redirect } from "@/i18n/navigation"
import { MapLoader } from "@/components/map/MapLoader"
import { loadMapSearchParams, mapUrl, roundPlace, type MapSearchParams } from "@/lib/map/url-state"
import { getGeocoder } from "@/server/container"
import { initialMapView } from "@/lib/map/initial-view"
import { getLocationFeature } from "@/server/services/locations"
import type { LocationFeature } from "@/lib/types/locations"
import { pageMetadata } from "@/i18n/seo"
import { log } from "@/server/log"
import { TILE_ORIGIN } from "@/lib/map/tiles"

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = (await params).locale as Locale
  const t = await getTranslations({ locale, namespace: "map.meta" })
  return pageMetadata("/map", locale, {
    title: t("title"),
    description: t("description"),
    keywords: t("keywords").split(",").map((k) => k.trim()),
    // No og:url: a shared /map?location=… link previews as itself, not as the bare map.
    openGraph: { title: t("ogTitle"), description: t("ogDescription"), url: undefined },
  })
}

/** Looks up the location a shared link names; the map opens without it if that fails. */
async function sharedLocation(id: string | null): Promise<LocationFeature | null> {
  if (!id) return null
  try {
    return await getLocationFeature(id)
  } catch (err) {
    log.with({ route: "/map" }).logError("page.failed", err, { step: "couldn't load the shared location" })
    return null
  }
}

/**
 * A link with a place name but no coordinates (`/map?q=Seattle&r=10`, typed
 * or from another site): geocodes it once here and returns the full URL to
 * redirect to, so the map, the list and a copied link all have the point.
 * Null when there's nothing to resolve, or the name isn't found (the map
 * then opens on the US).
 */
async function resolvePlace(params: MapSearchParams): Promise<string | null> {
  const q = params.q?.trim()
  if (!q || (params.lat !== null && params.lng !== null) || params.near) return null
  try {
    const [found] = await getGeocoder().search(q, { limit: 1 })
    if (!found) return null
    if (found.kind === "state" && found.state) return mapUrl("/map", { ...params, q: null, lat: null, lng: null, state: found.state })
    return mapUrl("/map", { ...params, q: found.label, lat: roundPlace(found.lat), lng: roundPlace(found.lng) })
  } catch (err) {
    log.with({ route: "/map" }).logError("page.failed", err, { step: "couldn't geocode the linked place" })
    return null
  }
}

/**
 * Reads the map's state from the URL on the server, so a shared link opens
 * on the same place, state or location with no flash of the US view.
 */
export default async function MapPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  // The basemap's host, connected while MapLibre downloads (#298). Its requests are CORS fetches.
  preconnect(TILE_ORIGIN, { crossOrigin: "anonymous" })
  const params = await loadMapSearchParams(searchParams)
  const resolved = await resolvePlace(params)
  if (resolved) redirect({ href: resolved, locale: await getLocale() })
  const [t, location] = await Promise.all([getTranslations("map.meta"), sharedLocation(params.location)])
  const [longitude, latitude] = location?.geometry.coordinates ?? []
  const view = initialMapView(params, location ? { longitude, latitude } : null)
  return (
    <>
      {/* Text to index without JavaScript (#255): the pins come from bot-checked APIs, so this is all a crawler reads. No location data. */}
      <header className="sr-only">
        <h1>{t("heading")}</h1>
        <p>{t("intro")}</p>
      </header>
      <MapLoader view={view} location={location} />
    </>
  )
}
