"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Layer, Marker, Source, useMap } from "./engine"
import { SOURCES, routeLineLayer, type MapColors } from "./layers"
import type { StreetRoute } from "@/lib/types/routes"
import { cameraPadding } from "./camera"
import { useTranslations } from "next-intl"

interface RouteOverlayProps {
  /** Location ids in visiting order (the URL's `route=`). */
  ids: readonly string[]
  colors: MapColors
  /** Clears `route=`. */
  onClear: () => void
}

/**
 * An assistant route on the map: the line from `/api/route` through the
 * stops in order, along the streets (solid) or, when it couldn't be routed,
 * straight (dashed), with a numbered marker on each stop, framed once it
 * loads. A toast offers to clear it.
 */
export function RouteOverlay({ ids, colors, onClear }: RouteOverlayProps) {
  const { current: map } = useMap()
  const t = useTranslations("map.route")
  const tm = useTranslations("map")
  const [route, setRoute] = useState<StreetRoute | null>(null)
  const key = ids.join(",")

  useEffect(() => {
    const ctl = new AbortController()
    setRoute(null)
    const count = key.split(",").length
    fetch(`/api/route?ids=${key.split(",").map(encodeURIComponent).join(",")}`, { signal: ctl.signal })
      .then(async (r) => {
        // Only a 404 means the places are gone; anything else is a failure to retry later.
        if (r.status === 404) {
          toast.error(t("failed"), { description: t("gone") })
          onClear()
          return
        }
        if (!r.ok) throw new Error(`GET /api/route failed (${r.status})`)
        const found = (await r.json()) as StreetRoute
        // Gone stops are skipped, so say so: the numbers no longer match the route card.
        if (found.stops.length < count) toast(t("someGone"), { description: t("someGoneBody") })
        setRoute(found)
      })
      .catch((err) => {
        if (ctl.signal.aborted) return
        console.error("[map] couldn't load the route", err)
        toast.error(t("failed"), { description: tm("connection") })
      })
    return () => ctl.abort()
    // onClear is a fresh closure each render; the ids decide what to load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // Frame the route once, when it arrives: the whole line, which can bulge past the stops.
  useEffect(() => {
    if (!route || !map) return
    const points = [...route.line.coordinates, ...route.stops.map((s) => [s.lng, s.lat])]
    const lngs = points.map((p) => p[0])
    const lats = points.map((p) => p[1])
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: cameraPadding(map.getContainer(), { sheet: true }), maxZoom: 14, duration: 1000 },
    )
    toast(route.routed ? t("shown") : t("straight"), {
      description: t("shownBody", { count: route.stops.length }),
      action: { label: t("clear"), onClick: onClear },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, map])

  const line = useMemo(() => route && { type: "Feature" as const, properties: {}, geometry: route.line }, [route])
  const routed = route?.routed ?? false
  const layer = useMemo(() => routeLineLayer(colors, routed), [colors, routed])

  if (!route || !line) return null
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
