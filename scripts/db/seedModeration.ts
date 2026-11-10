/**
 * A few pending submissions and an open report from the seeded members
 * (scripts/db/seedDevUsers.ts), so the review queue and Reports aren't empty
 * on a new local database. Labelled as samples; local databases only, like
 * the dev accounts.
 */
import type postgres from "postgres"
import { devAccount } from "./seedDevUsers"

const member = (email: Parameters<typeof devAccount>[0]) => devAccount(email).id
const DAY_MS = 24 * 60 * 60 * 1000

/** Fixed ids, so re-seeding doesn't add copies, and a sample someone already decided stays decided. */
export const SAMPLE_SUBMISSIONS = [
  {
    id: "00000000-0000-4000-8000-000000005a01",
    kind: "shop",
    by: member("ash@pokefindr.local"),
    lng: -97.74,
    lat: 30.27,
    payload: { name: "Pallet Town Cards (sample)", city: "Austin", state: "TX", countryCode: "US", address: "101 Congress Ave", hours: "Tue–Sun 11–8", sells: ["singles", "sealed"] },
  },
  {
    id: "00000000-0000-4000-8000-000000005a02",
    kind: "event",
    by: member("brock@pokefindr.local"),
    lng: -122.33,
    lat: 47.61,
    inDays: 10,
    payload: { name: "Pewter League night (sample)", city: "Seattle", state: "WA", countryCode: "US", venue: "Community hall", isFree: true },
  },
  {
    id: "00000000-0000-4000-8000-000000005a03",
    kind: "shop",
    by: member("serena@pokefindr.local"),
    lng: -118.24,
    lat: 34.05,
    payload: { name: "Tienda Kalos (sample)", city: "Los Angeles", state: "CA", countryCode: "US", sells: ["singles"] },
  },
] as const

/** The open report: misty says the first fixture vending machine is gone. */
export const SAMPLE_REPORT = {
  id: "00000000-0000-4000-8000-000000005b01",
  by: member("misty@pokefindr.local"),
  machineID: "Q00350",
  comment: "Sample report: the machine isn't here any more.",
} as const

/**
 * Adds the sample submissions and report if missing. A sample event that's
 * still pending gets its date moved to `now + inDays`, so it stays valid.
 * Skips a sample whose member isn't there (their username was taken).
 * The report is dated two days back, so it doesn't make misty's own report
 * of that machine a duplicate or count toward her daily limit. The
 * submissions keep the seed's time: older than a day, the queue would show
 * as late on a new database. Returns how many rows it added.
 */
export async function seedSampleModeration(sql: postgres.Sql, now = new Date()): Promise<number> {
  const reportedAt = new Date(now.getTime() - 2 * DAY_MS).toISOString()
  let added = 0
  for (const s of SAMPLE_SUBMISSIONS) {
    const payload = "inDays" in s ? { ...s.payload, startsAt: new Date(now.getTime() + s.inDays * DAY_MS).toISOString() } : s.payload
    const rows = await sql`
      insert into location_submissions (id, kind, payload, geog, submitted_by)
      select ${s.id}, ${s.kind}, ${sql.json(payload)}, st_setsrid(st_makepoint(${s.lng}, ${s.lat}), 4326)::geography, ${s.by}
      where exists (select 1 from profiles where id = ${s.by})
      on conflict (id) do update set payload = excluded.payload
        where location_submissions.status = 'pending' and location_submissions.payload is distinct from excluded.payload
      returning (xmax = 0) as inserted`
    if (rows[0]?.inserted) added++
  }
  const report = await sql`
    insert into status_reports (id, location_id, user_id, reason, comment, created_at)
    select ${SAMPLE_REPORT.id}, l.id, ${SAMPLE_REPORT.by}, 'gone', ${SAMPLE_REPORT.comment}, ${reportedAt}
    from locations l
    where l."machineID" = ${SAMPLE_REPORT.machineID} and exists (select 1 from profiles where id = ${SAMPLE_REPORT.by})
    on conflict (id) do nothing`
  return added + report.count
}
