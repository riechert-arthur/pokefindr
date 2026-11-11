"use client"

import { useMemo } from "react"
import { Map, MAP_STYLES } from "@/components/map/engine"
import { readMapColors } from "@/components/map/layers"
import { RouteLine } from "@/components/map/RouteLine"
import { routeBounds } from "@/components/map/useStreetRoute"
import { useMapLocale } from "@/components/map/useMapLocale"
import { useIsDark, useThemeKey } from "@/lib/design/useThemeKey"
import type { StreetRoute } from "@/lib/types/routes"

/**
 * The map inside the chat's route preview (#349), loaded only when a route
 * card shows (RoutePreview imports it with next/dynamic), so /home without a
 * route never downloads the map library. Framed to the whole line once; it
 * pans and zooms, but scrolling the chat over it doesn't zoom it.
 */
export default function RoutePreviewMap({ route }: { route: StreetRoute }) {
  const isDark = useIsDark()
  const themeKey = useThemeKey()
  // Re-read the token colors only when the theme changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const colors = useMemo(readMapColors, [themeKey])
  const locale = useMapLocale()
  const bounds = useMemo(() => routeBounds(route), [route])
  return (
    <Map
      initialViewState={{ bounds, fitBoundsOptions: { padding: 28, maxZoom: 14 } }}
      cooperativeGestures
      maxPitch={0}
      dragRotate={false}
      touchPitch={false}
      renderWorldCopies={false}
      attributionControl={{ compact: true }}
      locale={locale}
      style={{ width: "100%", height: "100%" }}
      mapStyle={isDark ? MAP_STYLES.dark : MAP_STYLES.light}
      // MapLibre opens the compact credits at first; on a map this small they'd cover the route.
      // Collapsed, they're one tap away on the (i) button.
      onLoad={(e) => {
        const credits = e.target.getContainer().querySelector(".maplibregl-ctrl-attrib")
        credits?.removeAttribute("open")
        credits?.classList.remove("maplibregl-compact-show")
      }}
    >
      <RouteLine route={route} colors={colors} />
    </Map>
  )
}
