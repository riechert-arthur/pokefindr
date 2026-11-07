"use client"

/**
 * The only module that imports the map library. Everything else imports the
 * map components and types from here, so swapping the library (or moving to
 * a new major version) touches one file.
 */
import "maplibre-gl/dist/maplibre-gl.css"

export {
  default as Map,
  FullscreenControl,
  GeolocateControl,
  Layer,
  Marker,
  NavigationControl,
  Popup,
  Source,
  useControl,
  useMap,
} from "@vis.gl/react-maplibre"
export type {
  GeolocateControlInstance,
  GeolocateErrorEvent,
  GeolocateResultEvent,
  LayerProps,
  MapGeoJSONFeature,
  MapLayerMouseEvent,
  MapMouseEvent,
  MapRef,
  ViewState,
  ViewStateChangeEvent,
} from "@vis.gl/react-maplibre"
export type { ExpressionSpecification, LayerSpecification, PaddingOptions } from "maplibre-gl"

/**
 * Basemap styles from OpenFreeMap (free, no key), the basemap the redesign
 * prototype names. Positron and Dark are neutral, so the token-colored layers
 * on top stand out. Picking the long-term tile provider (and styling the
 * basemap from the design tokens) is #47.
 */
export const MAP_STYLES = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
} as const

/**
 * Font stack for symbol layers. It must exist on the style's glyph server
 * (OpenFreeMap serves Noto Sans), or labels fail to render.
 */
export const MAP_FONT_BOLD = ["Noto Sans Bold"]
