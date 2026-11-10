import { afterAll, describe, expect, it } from "vitest"
import postgres from "postgres"
import { readSeedLocations, seedLocations } from "../../scripts/db/seedLocations"
import { SAMPLE_EVENTS, SAMPLE_SOURCE, seedSampleHighlights } from "../../scripts/db/seedHighlights"
import { DEV_ACCOUNTS, DEV_PASSWORD, DEV_USER, seedDevUsers } from "../../scripts/db/seedDevUsers"
import { verifyPassword } from "better-auth/crypto"
import { getDb } from "@/server/db/client"
import { getLocationsNear } from "@/server/services/locations"
import { getUpcomingEvents } from "@/server/services/highlights"
import { testDatabaseUrl } from "./testDatabase"

const sql = postgres(testDatabaseUrl(), { max: 1, onnotice: () => {} })

afterAll(async () => {
  await sql.end({ timeout: 5 })
})

describe("seedLocations", () => {
  const rows = readSeedLocations()

  it("has fixture rows with unique machine IDs", () => {
    expect(rows.length).toBeGreaterThan(0)
    expect(new Set(rows.map((r) => r.machineID)).size).toBe(rows.length)
  })

  it("inserts once, then changes nothing", async () => {
    expect(await seedLocations(sql, rows)).toEqual({ added: rows.length, updated: 0, unchanged: 0 })
    expect(await seedLocations(sql, rows)).toEqual({ added: 0, updated: 0, unchanged: rows.length })

    const [{ count }] = await sql<{ count: number }[]>`select count(*)::int as count from locations`
    expect(count).toBe(rows.length)
  })

  it("updates a row whose fixture values changed and stores the point", async () => {
    await seedLocations(sql, rows)
    const moved = { ...rows[0], name: "Renamed", longitude: -100, latitude: 40 }

    expect(await seedLocations(sql, [moved])).toEqual({ added: 0, updated: 1, unchanged: 0 })

    const [row] = await sql<{ name: string; lng: number; lat: number }[]>`
      select name, st_x(geog::geometry) as lng, st_y(geog::geometry) as lat
      from locations where "machineID" = ${moved.machineID}`
    expect(row).toEqual({ name: "Renamed", lng: -100, lat: 40 })
  })
})

describe("seedSampleHighlights", () => {
  it("replaces the sample events with upcoming ones, labelled as samples, and leaves real ones alone", async () => {
    await seedSampleHighlights(sql, new Date("2026-01-01T15:00:00Z"))
    await sql`insert into highlights (kind, title, starts_at, geog, is_sample) values ('event', 'Real show', '2026-01-10T18:00:00Z', st_setsrid(st_makepoint(0, 0), 4326)::geography, false)`
    const now = new Date("2026-11-07T15:00:00Z")
    expect(await seedSampleHighlights(sql, now)).toBe(SAMPLE_EVENTS.length)
    expect((await sql`select title from highlights where not is_sample`).map((r) => r.title)).toEqual(["Real show"])
    const rows = await sql<{ title: string; starts_at: Date; is_sample: boolean }[]>`select title, starts_at, is_sample from highlights where is_sample order by starts_at`
    expect(rows.map((r) => r.title)).toEqual(["Card show", "League challenge", "Restock weekend"])
    expect(rows.every((r) => r.is_sample && r.starts_at > now)).toBe(true)
    // Their locations' event_details move with them, since upcoming events read those first.
    const details = await sql<{ starts_at: Date }[]>`
      select e.starts_at from event_details e join locations l on l.id = e.location_id where l.source = ${SAMPLE_SOURCE}`
    expect(details).toHaveLength(SAMPLE_EVENTS.length)
    expect(details.every((d) => d.starts_at > now)).toBe(true)
  })

  it("puts each sample event at an event location, so searching its city finds it", async () => {
    const now = new Date("2026-11-07T15:00:00Z")
    await seedSampleHighlights(sql, now)
    const near = await getLocationsNear({ center: [-96.8, 32.78], radiusMiles: 10, types: ["event"] }, getDb())
    expect(near.total).toBe(1)
    expect(near.features[0].properties).toMatchObject({ retailer: "League challenge (sample)", city: "Dallas", state: "TX", kind: "event" })
    const events = await getUpcomingEvents(getDb(), now)
    expect(events.map((e) => [e.title, e.city, e.state, e.lng, e.lat, e.isSample])).toEqual([
      ["Card show", "Denver", "CO", -104.99, 39.74, true],
      ["League challenge", "Dallas", "TX", -96.8, 32.78, true],
      ["Restock weekend", "Sacramento", "CA", -121.49, 38.58, true],
    ])
  })

  it("keeps the sample places on re-seeding and hides one that's no longer a sample", async () => {
    await seedSampleHighlights(sql)
    const ids = async () => (await sql`select id from locations where source = ${SAMPLE_SOURCE} and is_active order by name`).map((r) => r.id)
    const before = await ids()
    await sql`insert into locations (kind, name, source, geog) values ('event', 'Old show (sample)', ${SAMPLE_SOURCE}, st_setsrid(st_makepoint(0, 0), 4326)::geography)`
    await seedSampleHighlights(sql)
    expect(await ids()).toEqual(before)
    expect(before).toHaveLength(SAMPLE_EVENTS.length)
    const [old] = await sql`select is_active from locations where name = 'Old show (sample)'`
    expect(old.is_active).toBe(false)
  })
})

describe("seedDevUsers", () => {
  const outcomes = async () => (await seedDevUsers(sql)).map((r) => [r.account.email, r.outcome])
  const accounts = () =>
    sql<{ email: string; username: string; role: string; onboarded: boolean; email_verified: boolean }[]>`
      select u.email, p.username, p.role, p.onboarded, u.email_verified
      from users u join profiles p on p.id = u.id order by u.email`

  it("adds every account once, then changes nothing", async () => {
    expect(await outcomes()).toEqual(DEV_ACCOUNTS.map((a) => [a.email, "added"]))
    const after = await accounts()
    expect(await outcomes()).toEqual(DEV_ACCOUNTS.map((a) => [a.email, "unchanged"]))
    expect(await accounts()).toEqual(after)
    expect(after).toEqual(
      [...DEV_ACCOUNTS]
        .sort((a, b) => a.email.localeCompare(b.email))
        .map((a) => ({ email: a.email, username: a.username, role: a.role, onboarded: true, email_verified: true })),
    )
    const [{ count }] = await sql<{ count: number }[]>`select count(*)::int as count from accounts where provider_id = 'credential'`
    expect(count).toBe(DEV_ACCOUNTS.length)
  })

  it("makes the dev account an admin", async () => {
    await seedDevUsers(sql)
    const [row] = await sql`select role from profiles where id = ${DEV_USER.id}`
    expect(row.role).toBe("admin")
  })

  it("puts a role changed by hand back to the seeded value", async () => {
    await seedDevUsers(sql)
    await sql`update profiles set role = 'member' where id = ${DEV_USER.id}`
    expect((await seedDevUsers(sql, [DEV_USER]))[0].outcome).toBe("role reset")
    const [row] = await sql`select role from profiles where id = ${DEV_USER.id}`
    expect(row.role).toBe(DEV_USER.role)
  })

  it("stores a password Better Auth accepts", async () => {
    await seedDevUsers(sql)
    const rows = await sql<{ password: string }[]>`select password from accounts where provider_id = 'credential'`
    expect(rows).toHaveLength(DEV_ACCOUNTS.length)
    for (const { password } of rows) {
      expect(await verifyPassword({ hash: password, password: DEV_PASSWORD })).toBe(true)
    }
  })
})
