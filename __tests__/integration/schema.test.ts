import { describe, it, expect } from "vitest"
import { eq, sql } from "drizzle-orm"
import { getDb } from "@/server/db/client"
import { locationRatings, locations, profiles } from "@/server/db/schema"

describe("schema", () => {
  it("round-trips a geography point", async () => {
    const db = getDb()
    const [inserted] = await db
      .insert(locations)
      .values({ machineId: "Q00350", name: "Frys", geog: { lng: -111.544047, lat: 33.413887 } })
      .returning()

    expect(inserted.geog).toEqual({ lng: -111.544047, lat: 33.413887 })

    const [{ srid }] = await db.execute<{ srid: number }>(
      sql`select ST_SRID(${locations.geog}::geometry) as srid from ${locations} where ${locations.id} = ${inserted.id}`,
    )
    expect(srid).toBe(4326)
  })

  it("enforces unique machineID", async () => {
    const db = getDb()
    await db.insert(locations).values({ machineId: "DUP", geog: { lng: 0, lat: 0 } })
    await expect(
      db.insert(locations).values({ machineId: "DUP", geog: { lng: 1, lat: 1 } }),
    ).rejects.toThrow()
  })

  it("rejects ratings outside 1-5 and cascades deletes", async () => {
    const db = getDb()
    const [user] = await db
      .insert(profiles)
      .values({ id: crypto.randomUUID(), username: "ash" })
      .returning()
    const [loc] = await db.insert(locations).values({ geog: { lng: 0, lat: 0 } }).returning()

    await expect(
      db.insert(locationRatings).values({ locationId: loc.id, userId: user.id, rating: 6 }),
    ).rejects.toThrow()

    await db.insert(locationRatings).values({ locationId: loc.id, userId: user.id, rating: 5 })
    await db.delete(locations).where(eq(locations.id, loc.id))
    expect(await db.select().from(locationRatings)).toHaveLength(0)
  })
})
