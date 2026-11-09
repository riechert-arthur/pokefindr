import "server-only"
import usStates from "../../../public/geo/us-states.json"

type Ring = number[][]
type Polygon = Ring[]
interface Region {
  code: string
  name: string
  polygons: Polygon[]
  /** [west, south, east, north], to skip most regions without the full test. */
  box: [number, number, number, number]
}

/** Whether the point is inside the ring (ray casting; the ring may or may not repeat its first point). */
function inRing([x, y]: [number, number], ring: Ring): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Inside the outer ring and in none of its holes. */
const inPolygon = (p: [number, number], [outer, ...holes]: Polygon) => inRing(p, outer) && !holes.some((h) => inRing(p, h))

function boxOf(polygons: Polygon[]): Region["box"] {
  const box: Region["box"] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const poly of polygons)
    for (const [x, y] of poly[0]) {
      box[0] = Math.min(box[0], x)
      box[1] = Math.min(box[1], y)
      box[2] = Math.max(box[2], x)
      box[3] = Math.max(box[3], y)
    }
  return box
}

type StatesFile = { features: { properties: { name: string; region: string }; geometry: { type: string; coordinates: unknown } }[] }

let regions: Region[] | null = null
function loadRegions(): Region[] {
  regions ??= (usStates as unknown as StatesFile).features.map((f) => {
    const polygons = (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates) as Polygon[]
    return { code: f.properties.region, name: f.properties.name, polygons, box: boxOf(polygons) }
  })
  return regions
}

/**
 * The supported country and region a point is in, from the outlines the map
 * draws (public/geo/us-states.json), or null outside them. The US is the
 * only supported country for now (src/lib/map/countries.ts).
 */
export function regionAt(lng: number, lat: number): { country: "US"; region: string; name: string } | null {
  const p: [number, number] = [lng, lat]
  for (const r of loadRegions()) {
    const [w, s, e, n] = r.box
    if (lng < w || lng > e || lat < s || lat > n) continue
    if (r.polygons.some((poly) => inPolygon(p, poly))) return { country: "US", region: r.code, name: r.name }
  }
  return null
}
