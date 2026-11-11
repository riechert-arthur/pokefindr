"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"

/**
 * MapLibre's own controls and hints in the page's language. It reads these
 * when the map is created; switching language loads a new page.
 */
export function useMapLocale(): Record<string, string> {
  const t = useTranslations("map.controls")
  return useMemo(
    () => ({
      "NavigationControl.ZoomIn": t("zoomIn"),
      "NavigationControl.ZoomOut": t("zoomOut"),
      "NavigationControl.ResetBearing": t("resetNorth"),
      "GeolocateControl.FindMyLocation": t("findMyLocation"),
      "GeolocateControl.LocationNotAvailable": t("locationNotAvailable"),
      "FullscreenControl.Enter": t("enterFullscreen"),
      "FullscreenControl.Exit": t("exitFullscreen"),
      "AttributionControl.ToggleAttribution": t("toggleAttribution"),
      "AttributionControl.MapFeedback": t("mapFeedback"),
      "Popup.Close": t("closePopup"),
      "Map.Title": t("map"),
      "Marker.Title": t("marker"),
      // Shown over a map that only zooms with a modifier key (the chat's route preview, #349).
      "CooperativeGesturesHandler.WindowsHelpText": t("cooperativeWindows"),
      "CooperativeGesturesHandler.MacHelpText": t("cooperativeMac"),
      "CooperativeGesturesHandler.MobileHelpText": t("cooperativeMobile"),
    }),
    [t],
  )
}
