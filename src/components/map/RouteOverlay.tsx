"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Layer, Marker, Source, useMap } from "./engine"
import { SOURCES, routeLineLayer, type MapColors } from "./layers"
import { MAX_ROUTE_STOPS, type StreetRoute } from "@/lib/types/routes"
import { cameraPadding } from "./camera"
import { useTranslations } from "next-intl"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
    const all = key.split(",")
    const gone = () => {
      toast.error(t("failed"), { description: t("gone") })
      onClear()
    }
    // A hand-edited link can hold a bad id or too many stops: draw the ones the API takes.
    const ids = all.filter((id) => UUID.test(id)).slice(0, MAX_ROUTE_STOPS)
    if (ids.length < 2) {
      gone()
      return
    }
    fetch(`/api/route?ids=${ids.join(",")}`, { signal: ctl.signal })
      .then(async (r) => {
        // Only a 404 (or a 400 for a link it can't route) means the places are gone; anything else is a failure to retry later.
        if (r.status === 404 || r.status === 400) return gone()
        if (!r.ok) throw new Error(`GET /api/route failed (${r.status})`)
        const found = (await r.json()) as StreetRoute
        // Gone stops are skipped, so say so: the numbers no longer match the route card.
        if (found.stops.length < all.length) toast(t("someGone"), { description: t("someGoneBody") })
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
    // One pass, not Math.min(...): a long routed line can have more points than a call takes arguments.
    let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity]
    for (const [lng, lat] of [...route.line.coordinates, ...route.stops.map((p) => [p.lng, p.lat])]) {
      if (lng < w) w = lng
      if (lng > e) e = lng
      if (lat < s) s = lat
      if (lat > n) n = lat
    }
    map.fitBounds(
      [
        [w, s],
        [e, n],
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
