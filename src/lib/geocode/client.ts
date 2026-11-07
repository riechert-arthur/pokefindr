import type { GeocodeResult } from "@/server/ports/geocoder"
import { roundNear } from "./query"

export type { GeocodeResult }

/** Places matching `q` from /api/geocode. Throws on an error status; abort with `signal`. */
export async function searchPlaces(
  q: string,
  { near, limit, signal }: { near?: [number, number]; limit?: number; signal?: AbortSignal } = {},
): Promise<GeocodeResult[]> {
  const params = new URLSearchParams({ q: q.trim() })
  if (near) params.set("near", roundNear(near))
  if (limit) params.set("limit", String(limit))
  const res = await fetch(`/api/geocode?${params}`, { signal })
  if (!res.ok) throw new Error(`Search failed (${res.status})`)
  const body = (await res.json()) as { results: GeocodeResult[] }
  return body.results
}
