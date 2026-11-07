import "server-only"
import { GeocoderError, type GeocodeOptions, type GeocodeResult } from "@/server/ports/geocoder"

export const DEFAULT_LIMIT = 5
/** Providers answer in well under a second; past this the search box shows an error instead of hanging. */
const TIMEOUT_MS = 5000

export const limitOf = (opts?: GeocodeOptions) => Math.min(Math.max(Math.trunc(opts?.limit ?? DEFAULT_LIMIT), 1), 10)
export const countryOf = (opts?: GeocodeOptions) => (opts?.country ?? "us").toLowerCase()

/**
 * GETs JSON from a provider. Times out after 5 s and follows the caller's
 * abort signal; an error status becomes a GeocoderError without the URL
 * (which can hold an API key).
 */
export async function getJson<T>(url: URL, provider: string, opts?: GeocodeOptions, headers?: HeadersInit): Promise<T> {
  const signals = [AbortSignal.timeout(TIMEOUT_MS), ...(opts?.signal ? [opts.signal] : [])]
  let res: Response
  try {
    res = await fetch(url, { headers: { Accept: "application/json", ...headers }, signal: AbortSignal.any(signals) })
  } catch (err) {
    // The caller gave up: not a provider failure.
    if (opts?.signal?.aborted) throw err
    // A timeout, DNS or connection failure. The cause's message can hold the URL.
    throw new GeocoderError(`${provider} geocoding failed (no response)`)
  }
  if (!res.ok) throw new GeocoderError(`${provider} geocoding failed with status ${res.status}`, res.status)
  try {
    return (await res.json()) as T
  } catch (err) {
    if (opts?.signal?.aborted) throw err
    throw new GeocoderError(`${provider} geocoding failed (not JSON)`)
  }
}

/** `path` under `base`, keeping any path in `base` (a self-hosted instance behind a prefix). */
export function endpoint(base: string, path: string): URL {
  return new URL(path.replace(/^\//, ""), base.endsWith("/") ? base : `${base}/`)
}

/** The rest of a label after the place's own name: the city and the state's code ("98101, Seattle, WA"). */
export const shortLabel = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(", ")

/** "Denver, CO": a city with its state's code, or the name alone outside a state. */
export const cityLabel = (name: string, state?: string) => (state ? `${name}, ${state}` : name)

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n)

/** Drops results without usable coordinates and keeps the first of any repeated label. */
export function clean(results: GeocodeResult[], limit: number): GeocodeResult[] {
  const seen = new Set<string>()
  return results
    .filter((r) => r.label && finite(r.lng) && finite(r.lat) && Math.abs(r.lng) <= 180 && Math.abs(r.lat) <= 90)
    .filter((r) => !seen.has(r.label) && seen.add(r.label))
    .slice(0, limit)
}
