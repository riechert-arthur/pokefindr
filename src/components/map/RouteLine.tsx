"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import { Layer, Marker, Source } from "./engine"
import { SOURCES, routeLineLayer, type MapColors } from "./layers"
import type { StreetRoute } from "@/lib/types/routes"

/**
 * A route drawn on a map: the line along the streets (solid) or straight
 * between the stops (dashed), and a numbered marker on each stop. Used by
 * the full map's RouteOverlay and the chat's route preview (#349).
 */
export function RouteLine({ route, colors }: { route: StreetRoute; colors: MapColors }) {
  const t = useTranslations("map.route")
  const line = useMemo(() => ({ type: "Feature" as const, properties: {}, geometry: route.line }), [route])
  const layer = useMemo(() => routeLineLayer(colors, route.routed), [colors, route.routed])
  return (
    <>
      <Source id={SOURCES.route} type="geojson" data={line}>
        <Layer {...layer} />
      </Source>
      {route.stops.map((s, i) => (
        <Marker key={`${s.id}-${i}`} longitude={s.lng} latitude={s.lat}>
          <span
            role="img"
            aria-label={t("stop", { n: i + 1, name: s.retailer })}
            className="grid size-[22px] place-items-center rounded-full border-2 border-card bg-primary text-caption font-bold text-primary-foreground shadow"
          >
            {i + 1}
          </span>
        </Marker>
      ))}
    </>
  )
}
