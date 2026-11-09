import "server-only"
import Anthropic from "@anthropic-ai/sdk"
import { oidcFederationProvider } from "@anthropic-ai/sdk/lib/credentials/oidc-federation"
import { identityTokenSource } from "@/server/adapters/claude/identity"
import { getServerConfig, type ServerConfig } from "@/server/config"
import type { Geocoder } from "@/server/ports/geocoder"
import type { Mailer } from "@/server/ports/mailer"
import { ConsoleMailer } from "@/server/adapters/mailer/console"
import { SmtpMailer } from "@/server/adapters/mailer/smtp"
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

export function makeMailer(config: ServerConfig): Mailer {
  switch (config.MAIL_PROVIDER) {
    case "smtp":
      return new SmtpMailer(config.SMTP_URL!, config.MAIL_FROM)
    case "console":
      return new ConsoleMailer(config.NODE_ENV === "production")
  }
}

let geocoder: Geocoder | undefined
let mailer: Mailer | undefined
let anthropic: Anthropic | null | undefined

/** The configured geocoder, built once per server instance. */
export function getGeocoder(): Geocoder {
  geocoder ??= makeGeocoder(getServerConfig())
  return geocoder
}

/** The configured mailer, built once per server instance. */
export function getMailer(): Mailer {
  mailer ??= makeMailer(getServerConfig())
  return mailer
}

const CLAUDE_OPTIONS = { maxRetries: 1, timeout: 60_000 } as const

/**
 * Builds the Claude API client from config: workload identity federation
 * when a rule is configured (short-lived tokens, no stored secret, #226),
 * else ANTHROPIC_API_KEY (local dev, tests), else null (the assistant says
 * it's unavailable).
 */
export function makeAnthropic(config: ServerConfig): Anthropic | null {
  if (config.ANTHROPIC_FEDERATION_RULE_ID && config.ANTHROPIC_ORGANIZATION_ID) {
    const credentials = oidcFederationProvider({
      identityTokenProvider: identityTokenSource(config),
      federationRuleId: config.ANTHROPIC_FEDERATION_RULE_ID,
      organizationId: config.ANTHROPIC_ORGANIZATION_ID,
      serviceAccountId: config.ANTHROPIC_SERVICE_ACCOUNT_ID,
      workspaceId: config.ANTHROPIC_WORKSPACE_ID,
      baseURL: "https://api.anthropic.com",
      fetch: (input, init) => fetch(input, init),
    })
    // The client caches the exchanged token and refreshes it before it expires.
    return new Anthropic({ ...CLAUDE_OPTIONS, credentials, apiKey: null })
  }
  if (config.ANTHROPIC_API_KEY) return new Anthropic({ ...CLAUDE_OPTIONS, apiKey: config.ANTHROPIC_API_KEY })
  return null
}

/** The Claude API client for the assistant, or null when none is configured. */
export function getAnthropic(): Anthropic | null {
  if (anthropic === undefined) anthropic = makeAnthropic(getServerConfig())
  return anthropic
}

/** Test helper: forget the built adapters so the next call re-reads config. */
export function resetContainerForTests() {
  geocoder = undefined
  mailer = undefined
  anthropic = undefined
}
