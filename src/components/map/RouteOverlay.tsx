"use client"

import { useEffect } from "react"
import { toast } from "sonner"
import { useMap } from "./engine"
import type { MapColors } from "./layers"
import { cameraPadding } from "./camera"
import { RouteLine } from "./RouteLine"
import { routeBounds, useStreetRoute } from "./useStreetRoute"
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
  const state = useStreetRoute(ids)
  const route = state.status === "ready" ? state.route : null

  // onClear is a fresh closure each render; the state decides what to say.
  useEffect(() => {
    if (state.status === "gone") {
      toast.error(t("failed"), { description: t("gone") })
      onClear()
    } else if (state.status === "failed") toast.error(t("failed"), { description: tm("connection") })
    // Gone stops are skipped, so say so: the numbers no longer match the route card.
    else if (state.status === "ready" && state.skipped) toast(t("someGone"), { description: t("someGoneBody") })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  // Frame the route once, when it arrives: the whole line, which can bulge past the stops.
  useEffect(() => {
    if (!route || !map) return
    map.fitBounds(routeBounds(route), { padding: cameraPadding(map.getContainer(), { sheet: true }), maxZoom: 14, duration: 1000 })
    toast(route.routed ? t("shown") : t("straight"), {
      description: t("shownBody", { count: route.stops.length }),
      action: { label: t("clear"), onClick: onClear },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, map])

  return route ? <RouteLine route={route} colors={colors} /> : null
}
