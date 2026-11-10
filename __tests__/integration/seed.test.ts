import { afterAll, describe, expect, it } from "vitest"
import postgres from "postgres"
import { readSeedLocations, seedLocations } from "../../scripts/db/seedLocations"
import { SAMPLE_EVENTS, SAMPLE_SOURCE, seedSampleHighlights } from "../../scripts/db/seedHighlights"
import { DEV_ACCOUNTS, DEV_PASSWORD, DEV_USER, seedDevUsers } from "../../scripts/db/seedDevUsers"
import { verifyPassword } from "better-auth/crypto"
import { NextResponse } from "next/server"
import { SAMPLE_REPORT, SAMPLE_SUBMISSIONS, seedSampleModeration } from "../../scripts/db/seedModeration"
import { approveSubmission, listQueue } from "@/server/services/moderation"
import { requireEntitlement, roleOf } from "@/server/admin/access"
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

  it("adds a moderator who can moderate but not open the admin-only sections", async () => {
    await seedDevUsers(sql)
    const mod = DEV_ACCOUNTS.find((a) => a.email === "moderator@pokefindr.local")!
    expect(await roleOf(mod.id)).toBe("moderator")
    const as = () => new Request("http://localhost:3000/api/admin/jobs", { headers: { "x-user-id": mod.id } })
    const jobs = await requireEntitlement(as(), "admin.jobs")
    expect(jobs instanceof NextResponse && jobs.status).toBe(404)
    expect(await requireEntitlement(as(), "moderation.view")).toEqual({ userId: mod.id, role: "moderator" })
  })

  it("adds every member once, as a member, one of them in Spanish", async () => {
    const members = DEV_ACCOUNTS.filter((a) => a.role === "member")
    expect(members.length).toBeGreaterThanOrEqual(3)
    await seedDevUsers(sql)
    await seedDevUsers(sql)
    const rows = await sql<{ email: string; role: string; locale: string | null }[]>`
      select u.email, p.role, p.locale from users u join profiles p on p.id = u.id where u.email in ${sql(members.map((m) => m.email))} order by u.email`
    expect(rows.map((r) => [r.email, r.role])).toEqual(members.map((m) => [m.email, "member"]).sort())
    expect(rows.filter((r) => r.locale === "es")).toHaveLength(1)
  })

  it("skips an account whose username someone signed up with, instead of failing", async () => {
    const ash = DEV_ACCOUNTS.find((a) => a.username === "ash")!
    await sql`insert into users (id, name, email) values (gen_random_uuid(), 'Other Ash', 'other@example.com')`
    await sql`insert into profiles (id, username) select id, 'Ash' from users where email = 'other@example.com'`
    expect((await seedDevUsers(sql, [ash]))[0].outcome).toBe("username taken")
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

describe("seedSampleModeration", () => {
  it("fills the review queue and Reports once, with samples from the seeded members", async () => {
    await seedLocations(sql, readSeedLocations())
    await seedDevUsers(sql)
    const now = new Date()
    expect(await seedSampleModeration(sql, now)).toBe(SAMPLE_SUBMISSIONS.length + 1)
    expect(await seedSampleModeration(sql, now)).toBe(0)
    const queue = await sql<{ name: string; status: string }[]>`select payload->>'name' as name, status from location_submissions order by id`
    expect(queue.map((q) => q.status)).toEqual(SAMPLE_SUBMISSIONS.map(() => "pending"))
    expect(queue.every((q) => q.name.endsWith("(sample)"))).toBe(true)
    expect(await listQueue(undefined, getDb(), now)).toHaveLength(SAMPLE_SUBMISSIONS.length)
    const [report] = await sql`select reason, resolved_at, user_id from status_reports where id = ${SAMPLE_REPORT.id}`
    expect(report).toMatchObject({ reason: "gone", resolved_at: null, user_id: SAMPLE_REPORT.by })
  })

  it("can be approved, and stays decided on re-seeding", async () => {
    await seedLocations(sql, readSeedLocations())
    await seedDevUsers(sql)
    await seedSampleModeration(sql)
    const event = SAMPLE_SUBMISSIONS.find((s) => s.kind === "event")!
    expect((await approveSubmission(event.id, DEV_USER.id, getDb())).status).toBe("done")
    await seedSampleModeration(sql)
    const [row] = await sql`select status from location_submissions where id = ${event.id}`
    expect(row.status).toBe("approved")
  })
})
