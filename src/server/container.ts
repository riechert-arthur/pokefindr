import "server-only"
import { getServerConfig, type ServerConfig } from "@/server/config"
import type { Geocoder } from "@/server/ports/geocoder"
import { FakeGeocoder } from "@/server/adapters/geocoder/fake"
import { MapboxGeocoder } from "@/server/adapters/geocoder/mapbox"
import { MapTilerGeocoder } from "@/server/adapters/geocoder/maptiler"
import { NominatimGeocoder } from "@/server/adapters/geocoder/nominatim"

/**
 * Builds the adapter for each port from config. Services and routes get
 * them here, never by importing an adapter, so a provider swap is a config
 * change. (config.ts checks that the selected provider has its key.)
 */
export function makeGeocoder(config: ServerConfig): Geocoder {
  switch (config.GEOCODER_PROVIDER) {
    case "mapbox":
      return new MapboxGeocoder(config.GEOCODER_API_KEY!)
    case "maptiler":
      return new MapTilerGeocoder(config.GEOCODER_API_KEY!)
    case "nominatim":
      return new NominatimGeocoder(config.GEOCODER_USER_AGENT!, config.GEOCODER_BASE_URL)
    case "fake":
      return new FakeGeocoder()
  }
}

let geocoder: Geocoder | undefined

/** The configured geocoder, built once per server instance. */
export function getGeocoder(): Geocoder {
  geocoder ??= makeGeocoder(getServerConfig())
  return geocoder
}

/** Test helper: forget the built adapters so the next call re-reads config. */
export function resetContainerForTests() {
  geocoder = undefined
}
