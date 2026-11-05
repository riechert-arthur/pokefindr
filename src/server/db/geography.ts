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
 * drizzle-kit wraps types it does not recognise in quotes, so any generated
 * migration that creates or alters a column of this type must be edited to
 * write `geography(point, 4326)` without quotes. A unit test
 * (__tests__/server/migrations.test.ts) fails if a quoted one slips through.
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
  const bytes = Uint8Array.from(hex.match(/../g) ?? [], (byte) => parseInt(byte, 16))
  const view = new DataView(bytes.buffer)
  const littleEndian = view.getUint8(0) === 1

  const type = view.getUint32(1, littleEndian)
  if ((type & 0xff) !== WKB_POINT) {
    throw new Error(`Expected a WKB Point, got geometry type ${type & 0xff}`)
  }

  const offset = type & EWKB_SRID_FLAG ? 9 : 5
  return {
    lng: view.getFloat64(offset, littleEndian),
    lat: view.getFloat64(offset + 8, littleEndian),
  }
}
