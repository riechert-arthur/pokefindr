import type { Feature, MultiPolygon, Polygon } from "geojson"

/** [[west, south], [east, north]] in degrees. */
export type LngLatBounds = [[number, number], [number, number]]

/** The lower 48, which the map opens on (from the redesign prototype). */
export const US_BOUNDS: LngLatBounds = [[-125.5, 24.0], [-66.5, 49.6]]

const MILES_PER_DEGREE_LAT = 69.0

/**
 * A geometry's bounding box. A shape that crosses the antimeridian (Alaska's
 * Aleutians) gets a box that continues west past -180 instead of one
 * spanning the whole world.
 */
export function boundsOf(geometry: Polygon | MultiPolygon): LngLatBounds {
  const rings = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates
  const box = (shift: boolean): LngLatBounds => {
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity
    for (const polygon of rings) {
      for (const [x, lat] of polygon[0]) {
        const lng = shift && x > 0 ? x - 360 : x
        if (lng < w) w = lng
        if (lng > e) e = lng
        if (lat < s) s = lat
        if (lat > n) n = lat
      }
    }
    return [[w, s], [e, n]]
  }
  const plain = box(false)
  return plain[1][0] - plain[0][0] > 180 ? box(true) : plain
}

/** Degrees of longitude and latitude that `miles` spans at `lat`. */
function milesToDegrees(lat: number, miles: number) {
  const dLat = miles / MILES_PER_DEGREE_LAT
  const dLng = miles / (MILES_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180))
  return { dLng, dLat }
}

/** The box around a circle of `miles` around a point. */
export function boundsOfRadius(lng: number, lat: number, miles: number): LngLatBounds {
  const { dLng, dLat } = milesToDegrees(lat, miles)
  return [[lng - dLng, lat - dLat], [lng + dLng, lat + dLat]]
}

/** A circle of `miles` around a point, as a 72-sided polygon. */
export function radiusCircle(lng: number, lat: number, miles: number): Feature<Polygon> {
  const { dLng, dLat } = milesToDegrees(lat, miles)
  const ring: [number, number][] = []
  for (let k = 0; k <= 72; k++) {
    const a = (k / 72) * 2 * Math.PI
    ring.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)])
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } }
}

/** Straight-line (great-circle) distance in miles. */
export function milesBetween(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const rad = Math.PI / 180
  const dLat = (lat2 - lat1) * rad
  const dLng = (lng2 - lng1) * rad
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2
  return 3958.8 * 2 * Math.asin(Math.sqrt(a))
}
