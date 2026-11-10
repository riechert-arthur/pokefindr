/**
 * The assistant's input check (#253, docs/moderation.md): a question the
 * check blocks never reaches the model, and its turn is logged with outcome
 * `blocked` (and the flag `moderated`).
 */
import { sql, type Kysely } from "kysely"

type Db = Kysely<unknown>

const OUTCOMES = ["answered", "refused", "tool_limit", "max_tokens", "error", "stopped", "limited", "paused"]
const check = (outcomes: string[]) => sql`outcome in (${sql.join(outcomes.map((o) => sql.lit(o)))})`

export async function up(db: Db): Promise<void> {
  await db.schema.alterTable("assistant_turns").dropConstraint("assistant_turns_outcome_check").execute()
  await db.schema.alterTable("assistant_turns").addCheckConstraint("assistant_turns_outcome_check", check([...OUTCOMES, "blocked"])).execute()
}

export async function down(db: Db): Promise<void> {
  // The old check has no `blocked`: those turns become refusals, the nearest outcome it has.
  await sql`update assistant_turns set outcome = 'refused' where outcome = 'blocked'`.execute(db)
  await db.schema.alterTable("assistant_turns").dropConstraint("assistant_turns_outcome_check").execute()
  await db.schema.alterTable("assistant_turns").addCheckConstraint("assistant_turns_outcome_check", check(OUTCOMES)).execute()
}
