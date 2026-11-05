import { customType } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export interface LngLat {
  lng: number
  lat: number
}

/**
 * PostGIS `geography(Point, 4326)` column.
 *
 * Writes go through ST_MakePoint so the driver never has to encode WKB.
 * Reads arrive as (E)WKB hex, which `parsePointWkb` decodes.
 *
 * drizzle-kit can't read this custom type back from a database, so the drift
 * check (scripts/db/drift.ts) skips its false "change the type" for these
 * columns after checking the type itself.
 */
export const geographyPoint = customType<{ data: LngLat; driverData: string }>({
  dataType() {
    return "geography(point, 4326)"
  },
  toDriver(value) {
    return sql`ST_SetSRID(ST_MakePoint(${value.lng}, ${value.lat}), 4326)::geography`
  },
  fromDriver(value) {
    return parsePointWkb(value)
  },
})

const WKB_POINT = 1
const EWKB_SRID_FLAG = 0x20000000

/** Decodes a hex-encoded (E)WKB Point into longitude/latitude. */
export function parsePointWkb(hex: string): LngLat {
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) throw new Error("Expected a hex-encoded WKB Point")
  const bytes = Uint8Array.from(hex.match(/../g) ?? [], (byte) => parseInt(byte, 16))
  // Byte order (1) + type (4), then an optional SRID (4).
  if (bytes.length < 5) throw new Error(`WKB Point is too short (${bytes.length} bytes)`)
  const view = new DataView(bytes.buffer)
  const littleEndian = view.getUint8(0) === 1

  const type = view.getUint32(1, littleEndian)
  if ((type & 0xff) !== WKB_POINT) {
    throw new Error(`Expected a WKB Point, got geometry type ${type & 0xff}`)
  }

  const offset = type & EWKB_SRID_FLAG ? 9 : 5
  if (bytes.length < offset + 16) throw new Error(`WKB Point is too short (${bytes.length} bytes)`)
  const point = {
    lng: view.getFloat64(offset, littleEndian),
    lat: view.getFloat64(offset + 8, littleEndian),
  }
  // POINT EMPTY is encoded as NaN coordinates.
  if (!Number.isFinite(point.lng) || !Number.isFinite(point.lat)) throw new Error("WKB Point is empty")
  return point
}
