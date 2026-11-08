/**
 * "Report a problem" in the details panel (#120): a report says why a
 * location is wrong instead of (or as well as) its stock status.
 *
 * - `reason`: gone, wrong_location, empty or other.
 * - `status` (stocked, out-of-stock, out-of-order) becomes optional; a row
 *   has a status, a reason, or both.
 * - An index on (user_id, created_at) for the per-user rate limit.
 *
 * Down deletes reason-only reports, which the old schema can't hold.
 */
import { sql, type Kysely } from "kysely"

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table status_reports
      alter column status drop not null,
      add column reason text,
      add constraint status_reports_reason_check check (reason in ('gone', 'wrong_location', 'empty', 'other')),
      add constraint status_reports_status_or_reason_check check (status is not null or reason is not null)
  `.execute(db)
  await db.schema.createIndex("status_reports_user_created_idx").on("status_reports").columns(["user_id", "created_at"]).execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex("status_reports_user_created_idx").execute()
  await sql`delete from status_reports where status is null`.execute(db)
  await sql`
    alter table status_reports
      drop constraint status_reports_status_or_reason_check,
      drop constraint status_reports_reason_check,
      drop column reason,
      alter column status set not null
  `.execute(db)
}
