import "server-only"
import Anthropic from "@anthropic-ai/sdk"
import { getServerConfig, type ServerConfig } from "@/server/config"
import type { Geocoder } from "@/server/ports/geocoder"
import { FakeGeocoder } from "@/server/adapters/geocoder/fake"
import { PhotonGeocoder } from "@/server/adapters/geocoder/photon"
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
    case "photon":
      return new PhotonGeocoder(config.GEOCODER_BASE_URL)
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
let anthropic: Anthropic | null | undefined

/** The configured geocoder, built once per server instance. */
export function getGeocoder(): Geocoder {
  geocoder ??= makeGeocoder(getServerConfig())
  return geocoder
}

/** The Claude API client for the assistant, or null when no key is configured. */
export function getAnthropic(): Anthropic | null {
  if (anthropic === undefined) {
    const key = getServerConfig().ANTHROPIC_API_KEY
    anthropic = key ? new Anthropic({ apiKey: key, maxRetries: 1, timeout: 60_000 }) : null
  }
  return anthropic
}

/** Test helper: forget the built adapters so the next call re-reads config. */
export function resetContainerForTests() {
  geocoder = undefined
  anthropic = undefined
}
