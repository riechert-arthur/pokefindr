"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Layer, Marker, Source, useMap } from "./engine"
import { SOURCES, routeLineLayer, type MapColors } from "./layers"
import type { LocationFeature } from "@/lib/types/locations"
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
 * An assistant route on the map, as the prototype draws it: a dashed line
 * through the stops in order and a numbered marker on each, framed once
 * they load. A toast offers to clear it.
 */
export function RouteOverlay({ ids, colors, onClear }: RouteOverlayProps) {
  const { current: map } = useMap()
  const t = useTranslations("map.route")
  const tm = useTranslations("map")
  const [stops, setStops] = useState<LocationFeature[] | null>(null)
  const key = ids.join(",")

  useEffect(() => {
    const ctl = new AbortController()
    setStops(null)
    Promise.all(
      key.split(",").map((id) =>
        fetch(`/api/locations/${encodeURIComponent(id)}`, { signal: ctl.signal }).then((r) => {
          // Only a 404 means the place is gone; anything else is a failure to retry later.
          if (r.status === 404) return null
          if (!r.ok) throw new Error(`GET /api/locations/${id} failed (${r.status})`)
          return r.json() as Promise<LocationFeature>
        }),
      ),
    )
      .then((found) => {
        const ok = found.filter((f): f is LocationFeature => f !== null)
        if (ok.length < 2) {
          toast.error(t("failed"), { description: t("gone") })
          onClear()
          return
        }
        // Gone stops are skipped, so say so: the numbers no longer match the route card.
        if (ok.length < found.length) toast(t("someGone"), { description: t("someGoneBody") })
        setStops(ok)
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

  // Frame the route once, when it arrives.
  useEffect(() => {
    if (!stops || !map) return
    const lngs = stops.map((s) => s.geometry.coordinates[0])
    const lats = stops.map((s) => s.geometry.coordinates[1])
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: cameraPadding(map.getContainer(), { sheet: true }), maxZoom: 14, duration: 1000 },
    )
    toast(t("shown"), { description: t("shownBody", { count: stops.length }), action: { label: t("clear"), onClick: onClear } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops, map])

  const line = useMemo(
    () =>
      stops && {
        type: "Feature" as const,
        properties: {},
        geometry: { type: "LineString" as const, coordinates: stops.map((s) => s.geometry.coordinates) },
      },
    [stops],
  )
  const layer = useMemo(() => routeLineLayer(colors), [colors])

  if (!stops || !line) return null
  return (
    <>
      <Source id={SOURCES.route} type="geojson" data={line}>
        <Layer {...layer} />
      </Source>
      {stops.map((s, i) => (
        <Marker key={s.properties.id} longitude={s.geometry.coordinates[0]} latitude={s.geometry.coordinates[1]}>
          <span
            role="img"
            aria-label={t("stop", { n: i + 1, name: s.properties.retailer })}
            className="grid size-[22px] place-items-center rounded-full border-2 border-card bg-primary text-caption font-bold text-primary-foreground shadow"
          >
            {i + 1}
          </span>
        </Marker>
      ))}
    </>
  )
}
