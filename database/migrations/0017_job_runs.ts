/**
 * Job run history and pauses (#157), for the admin's Jobs page:
 *
 * - `job_runs`: one row per run, written by the job library (runJob) and by
 *   the location import: the job, how it was started, when, how it ended
 *   (running, succeeded, failed, skipped while paused), its counts (the
 *   job's result) or error.
 * - `job_pauses`: a paused job, who paused it and why. Cron and queue runs
 *   of a paused job are recorded as skipped instead of running.
 */
import { sql, type Kysely } from "kysely"

type Db = Kysely<unknown>

export async function up(db: Db): Promise<void> {
  await db.schema
    .createTable("job_runs")
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("job", "text", (c) => c.notNull())
    .addColumn("trigger", "text", (c) => c.notNull())
    .addColumn("status", "text", (c) => c.notNull())
    .addColumn("started_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn("finished_at", "timestamptz")
    .addColumn("result", "jsonb")
    .addColumn("error", "text")
    .addCheckConstraint("job_runs_status_check", sql`status in ('running', 'succeeded', 'failed', 'skipped')`)
    .execute()
  await db.schema.createIndex("job_runs_job_started_idx").on("job_runs").columns(["job", "started_at"]).execute()

  await db.schema
    .createTable("job_pauses")
    .addColumn("job", "text", (c) => c.primaryKey())
    .addColumn("reason", "text", (c) => c.notNull())
    .addColumn("paused_by", "uuid")
    .addColumn("paused_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addForeignKeyConstraint("job_pauses_paused_by_profiles_id_fk", ["paused_by"], "profiles", ["id"], (c) => c.onDelete("set null"))
    .execute()
}

export async function down(db: Db): Promise<void> {
  await db.schema.dropTable("job_pauses").execute()
  await db.schema.dropTable("job_runs").execute()
}
