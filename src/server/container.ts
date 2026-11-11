import "server-only"
import Anthropic from "@anthropic-ai/sdk"
import { oidcFederationProvider } from "@anthropic-ai/sdk/lib/credentials/oidc-federation"
import { identityTokenSource } from "@/server/adapters/claude/identity"
import { getServerConfig, type ServerConfig } from "@/server/config"
import type { Geocoder } from "@/server/ports/geocoder"
import type { Mailer } from "@/server/ports/mailer"
import type { Router } from "@/server/ports/router"
import type { SharedRateLimiter } from "@/server/ports/rate-limiter"
import type { ContentModerator } from "@/server/ports/moderator"
import { FakeModerator } from "@/server/adapters/moderator/fake"
import { ClaudeModerator } from "@/server/adapters/moderator/claude"
import type { ImageStore } from "@/server/ports/image-store"
import { LocalImageStore } from "@/server/adapters/image-store/local"
import { MemoryImageStore } from "@/server/adapters/image-store/memory"
import { VercelBlobImageStore } from "@/server/adapters/image-store/vercel-blob"
import { MemoryRateLimiter } from "@/server/adapters/rate-limiter/memory"
import { PostgresRateLimiter } from "@/server/adapters/rate-limiter/postgres"
import { getDb } from "@/server/db/client"
import { ConsoleMailer } from "@/server/adapters/mailer/console"
import { SmtpMailer } from "@/server/adapters/mailer/smtp"
import { FakeGeocoder } from "@/server/adapters/geocoder/fake"
import { PhotonGeocoder } from "@/server/adapters/geocoder/photon"
import { MapboxGeocoder } from "@/server/adapters/geocoder/mapbox"
import { MapTilerGeocoder } from "@/server/adapters/geocoder/maptiler"
import { NominatimGeocoder } from "@/server/adapters/geocoder/nominatim"
import { FakeRouter } from "@/server/adapters/router/fake"
import { OpenRouteServiceRouter } from "@/server/adapters/router/openrouteservice"
import { OsrmRouter } from "@/server/adapters/router/osrm"

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

export function makeRouter(config: ServerConfig): Router {
  switch (config.ROUTER_PROVIDER) {
    case "openrouteservice":
      return new OpenRouteServiceRouter(config.ROUTER_API_KEY!, config.ROUTER_BASE_URL)
    case "osrm":
      return new OsrmRouter(config.ROUTER_BASE_URL)
    case "fake":
      // Allowed, so a deploy without the key still works, but say so: every route is straight.
      if (config.NODE_ENV === "production") console.warn("[router] no ROUTER_API_KEY in production; assistant routes are straight lines")
      return new FakeRouter()
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

export function makeRateLimiter(config: ServerConfig): SharedRateLimiter {
  switch (config.RATE_LIMIT_STORE) {
    case "postgres":
      return new PostgresRateLimiter(getDb)
    case "memory":
      return new MemoryRateLimiter()
  }
}

/** The image store for profile pictures (#290), or null when uploads are off (IMAGE_STORE=none). */
export function makeImageStore(config: ServerConfig): ImageStore | null {
  switch (config.IMAGE_STORE) {
    case "vercel-blob":
      return new VercelBlobImageStore(config.BLOB_READ_WRITE_TOKEN!)
    case "local":
      return new LocalImageStore()
    case "memory":
      return new MemoryImageStore()
    case "none":
      return null
  }
}

let geocoder: Geocoder | undefined
let moderator: ContentModerator | undefined
let moderatorForTests: ContentModerator | null = null
let imageStore: ImageStore | null | undefined
let router: Router | undefined
let rateLimiter: SharedRateLimiter | undefined
let mailer: Mailer | undefined
let anthropic: Anthropic | null | undefined

/** The configured geocoder, built once per server instance. */
export function getGeocoder(): Geocoder {
  geocoder ??= makeGeocoder(getServerConfig())
  return geocoder
}

/** The configured router (#288), built once per server instance. */
export function getRouter(): Router {
  router ??= makeRouter(getServerConfig())
  return router
}

/** The configured mailer, built once per server instance. */
export function getMailer(): Mailer {
  mailer ??= makeMailer(getServerConfig())
  return mailer
}

/** The API's rate limiter (#199), built once per server instance. */
export function getRateLimiter(): SharedRateLimiter {
  rateLimiter ??= makeRateLimiter(getServerConfig())
  return rateLimiter
}

/** The configured image store, built once per server instance; null when uploads are off. */
export function getImageStore(): ImageStore | null {
  if (imageStore === undefined) imageStore = makeImageStore(getServerConfig())
  return imageStore
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

/**
 * The content moderator (#253) from config: Claude Haiku through the same
 * client as the assistant, or the keyword fake.
 */
export function makeModerator(config: ServerConfig, client: () => Anthropic | null = getAnthropic): ContentModerator {
  switch (config.MODERATION_PROVIDER) {
    case "claude": {
      const c = client()
      // config.ts checks the credentials are set; null here means they couldn't be used.
      if (!c) throw new Error("MODERATION_PROVIDER is claude, but there's no Claude client")
      return new ClaudeModerator(c, config.MODERATION_MODEL)
    }
    case "fake":
      return new FakeModerator()
  }
}

/** The configured content moderator, built once per server instance. */
export function getModerator(): ContentModerator {
  if (moderatorForTests) return moderatorForTests
  moderator ??= makeModerator(getServerConfig())
  return moderator
}

/** Test helper: check with this moderator (null restores the configured one). */
export function setModeratorForTests(m: ContentModerator | null) {
  moderatorForTests = m
}

/** Test helper: forget the built adapters so the next call re-reads config. */
export function resetContainerForTests() {
  geocoder = undefined
  router = undefined
  mailer = undefined
  anthropic = undefined
  moderator = undefined
  imageStore = undefined
}
