"use client"

import { useEffect, useRef } from "react"
import { toast } from "sonner"
import { useControl, type GeolocateControlInstance, type GeolocateErrorEvent, type GeolocateResultEvent } from "./engine"

/** Wording from the redesign prototype. */
export const LOCATION_DENIED = {
  title: "Location is off",
  description: "Search a city or address to see what's nearby.",
}

export const LOCATION_UNAVAILABLE = {
  title: "Couldn't find your location",
  description: "Search a city or address to see what's nearby.",
}

const PERMISSION_DENIED = 1

/** MapLibre internals the Strict Mode guard below wraps. */
type GeolocateInternals = GeolocateControlInstance & {
  _setupUI: () => void
  _finishSetupUI: (supported: boolean) => void
  _container: HTMLElement
}

interface LocateControlProps {
  /** Called with the viewer's position each time they tap the button (or after `autoLocate`). */
  onLocate: (position: { lng: number; lat: number }) => void
  /** Locate once the map is ready: a shared `near=me` link asks the new viewer. */
  autoLocate?: boolean
}

/**
 * MapLibre's GeolocateControl (blue dot and accuracy circle), styled in
 * globals.css to match the prototype. Like the prototype, each tap locates
 * once and the map shows the radius around the viewer; the button turns
 * --me once they're found. (Follow mode would pull the camera back to the
 * dot on every position update, away from the radius.)
 *
 * The browser asks for permission only when the button is tapped, never on
 * page load. If the viewer says no, MapLibre disables the button for the
 * rest of the visit, so search stays the way in.
 */
export function LocateControl({ onLocate, autoLocate = false }: LocateControlProps) {
  const handlers = useRef({ onLocate })
  handlers.current = { onLocate }

  const control = useControl(
    ({ mapLib }) => {
      const gc = new mapLib.GeolocateControl({
        trackUserLocation: false,
        showAccuracyCircle: true,
        positionOptions: { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
      }) as GeolocateInternals
      // React Strict Mode adds, removes and re-adds the control. MapLibre
      // builds the button and then finishes setup asynchronously, so both
      // setups would finish and attach two click handlers, and every tap
      // would switch tracking on and straight back off. Build the button
      // once and finish setup once.
      const setupUI = gc._setupUI.bind(gc)
      gc._setupUI = () => {
        if (!gc._container.hasChildNodes()) setupUI()
      }
      const finishSetupUI = gc._finishSetupUI.bind(gc)
      let finished = false
      gc._finishSetupUI = (supported) => {
        if (finished) return
        finished = true
        finishSetupUI(supported)
      }
      gc.on("geolocate", (e: GeolocateResultEvent) => {
        gc._container.dataset.located = "true"
        handlers.current.onLocate({ lng: e.coords.longitude, lat: e.coords.latitude })
      })
      gc.on("error", (e: GeolocateErrorEvent) => {
        delete gc._container.dataset.located
        const message = e.code === PERMISSION_DENIED ? LOCATION_DENIED : LOCATION_UNAVAILABLE
        toast(message.title, { description: message.description })
      })
      return gc
    },
    { position: "bottom-right" },
  )

  useEffect(() => {
    if (!autoLocate) return
    // Setup finishes asynchronously (MapLibre checks for geolocation support first).
    let tries = 0
    const id = setInterval(() => {
      if (control.trigger() !== false || ++tries > 20) clearInterval(id)
    }, 100)
    return () => clearInterval(id)
  }, [autoLocate, control])

  return null
}
