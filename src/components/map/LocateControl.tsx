"use client"

import { useEffect, useRef } from "react"
import { toast } from "sonner"
import { LOCATE_GIVE_UP_MS } from "@/lib/map/locate"
import { useControl, type GeolocateControlInstance, type GeolocateErrorEvent, type GeolocateResultEvent } from "./engine"
import { useTranslations } from "next-intl"

const PERMISSION_DENIED = 1

/** Why locating failed: picks the toast (map.locate in the catalog, worded as in the redesign prototype). */
type LocateFailure = "denied" | "unavailable"

/** How long to wait for an answer before giving up (see src/lib/map/locate.ts). */
export { LOCATE_GIVE_UP_MS }

/** How many times (100 ms apart) a near=me link tries to start locating before giving up. */
export const AUTO_LOCATE_TRIES = 20

/** MapLibre internals the Strict Mode guard below wraps. */
type GeolocateInternals = GeolocateControlInstance & {
  _finishSetupUI: (supported: boolean) => void
  _container: HTMLElement
}

interface LocateControlProps {
  /** Called with the viewer's position each time they tap the button (or after `autoLocate`). */
  onLocate: (position: { lng: number; lat: number }) => void
  /** Called when locating fails (denied, unavailable or timed out). */
  onError?: () => void
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
export function LocateControl({ onLocate, onError, autoLocate = false }: LocateControlProps) {
  const t = useTranslations("map.locate")
  const handlers = useRef({ onLocate, onError, t })
  handlers.current = { onLocate, onError, t }

  const control = useControl(
    ({ mapLib }) => {
      const gc = new mapLib.GeolocateControl({
        trackUserLocation: false,
        showAccuracyCircle: true,
        positionOptions: { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
      }) as GeolocateInternals
      // React Strict Mode adds, removes and re-adds the control. MapLibre
      // finishes setup asynchronously after each add, so both setups would
      // finish and attach two click handlers, and every tap would locate and
      // cancel at once. Finish setup once. (Each add builds a fresh container
      // and button; the first finish wires up the one on the map by then.)
      const finishSetupUI = gc._finishSetupUI.bind(gc)
      let finished = false
      gc._finishSetupUI = (supported) => {
        if (finished) return
        finished = true
        finishSetupUI(supported)
      }

      let giveUp: ReturnType<typeof setTimeout> | undefined
      const settle = () => {
        clearTimeout(giveUp)
        delete gc._container.dataset.locating
      }
      const fail = (failure: LocateFailure) => {
        settle()
        delete gc._container.dataset.located
        const { t } = handlers.current
        toast(t(failure), { description: t("hint") })
        handlers.current.onError?.()
      }

      // MapLibre's one-shot mode shows nothing while it waits for a position
      // (up to the 10 s timeout), so mark the button "locating" ourselves.
      // trigger() can also throw (no navigator.geolocation while the
      // Permissions API doesn't say "denied"): report it instead.
      const trigger = gc.trigger.bind(gc)
      gc.trigger = () => {
        try {
          const started = trigger()
          if (started !== false) {
            gc._container.dataset.locating = "true"
            clearTimeout(giveUp)
            giveUp = setTimeout(() => {
              if (gc._container.dataset.locating) fail("unavailable")
            }, LOCATE_GIVE_UP_MS)
          }
          return started
        } catch (err) {
          console.error("[map] couldn't start locating", err)
          fail("unavailable")
          return true
        }
      }

      gc.on("geolocate", (e: GeolocateResultEvent) => {
        settle()
        gc._container.dataset.located = "true"
        handlers.current.onLocate({ lng: e.coords.longitude, lat: e.coords.latitude })
      })
      gc.on("error", (e: GeolocateErrorEvent) => {
        fail(e.code === PERMISSION_DENIED ? "denied" : "unavailable")
      })
      return gc
    },
    { position: "bottom-right" },
  )

  useEffect(() => {
    if (!autoLocate) return
    // Setup finishes asynchronously (MapLibre checks for geolocation support
    // first); trigger() returns false until then. Give up after ~2 s.
    let tries = 0
    const id = setInterval(() => {
      if (control.trigger() !== false || ++tries >= AUTO_LOCATE_TRIES) clearInterval(id)
    }, 100)
    return () => clearInterval(id)
  }, [autoLocate, control])

  return null
}
