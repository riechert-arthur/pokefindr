/**
 * Compares the live `public` schema with the schema a list of migrations builds.
 *
 * Used by `db:baseline` to refuse recording the baseline on a database that
 * doesn't match it. The migrations run in a scratch schema inside the
 * caller's transaction, under a savepoint that is always rolled back, so
 * Postgres describes both sides the same way and nothing is left behind.
 *
 * Compares, for every table the migrations create: columns (type, nullability,
 * whether it has a default), primary keys, indexes, foreign keys and check
 * constraints, plus the enums the migrations create. Index and constraint
 * names are ignored, because Postgres and Supabase name them differently; what
 * they cover is compared. Indexes and checks are compared by their full
 * definitions as Postgres prints them, so partial predicates, expressions,
 * operator classes, sort order and check bodies all count.
 *
 * Deliberately not compared: tables the migrations don't create (e.g. the
 * legacy "Vending Machine Locations"), views, row-level security, foreign keys
 * into other schemas (Supabase's `auth`), and default expressions (only whether
 * a default exists, since `gen_random_uuid()` vs `uuid_generate_v4()` both work).
 */
import { sql, type Migration, type RawBuilder, type Transaction } from "kysely"

const SCRATCH_SCHEMA = "_schema_check"

const ON_DELETE: Record<string, string> = {
  a: "no action",
  r: "restrict",
  c: "cascade",
  n: "set null",
  d: "set default",
}

// format_type() schema-qualifies types whose schema isn't on search_path
// (public.location_status, extensions.geography(...)), so drop any schema prefix.
const normType = (t: string) => t.replace(/^(?:"(?:[^"]|"")+"|[a-z_][a-z0-9_$]*)\./, "")

// Index and check definitions qualify names the same way, e.g. a cast in a
// predicate prints as ::public.location_status on one side and ::location_status
// on the other. Drop the prefixes of the schemas being compared.
const QUALIFIER = new RegExp(`(?<![\\w$"])"?(?:public|extensions|${SCRATCH_SCHEMA})"?\\.`, "g")
const unqualify = (def: string) => def.replace(QUALIFIER, "")

/** A fact about one table (or an enum), as a readable, name-independent string. */
interface Fact {
  table?: string
  text: string
}

interface Description {
  tables: Set<string>
  enums: Set<string>
  facts: Fact[]
}

/**
 * Describes the tables and enums in `schema`. When `only` is given, describes
 * just those tables and enums.
 */
async function describeSchema(
  db: Transaction<unknown>,
  schema: string,
  only?: { tables: Set<string>; enums: Set<string> },
): Promise<Description> {
  const keepTable = (t: string) => !only || only.tables.has(t)
  const facts: Fact[] = []
  const rows = async <R>(query: RawBuilder<R>) => (await query.execute(db)).rows

  const tables = new Set(
    (
      await rows<{ name: string }>(sql`
        select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = ${schema} and c.relkind in ('r', 'p')`)
    )
      .map((r) => r.name)
      .filter(keepTable),
  )
  for (const table of tables) facts.push({ text: `table ${table}` })

  const columns = await rows<{ table: string; column: string; type: string; not_null: boolean; has_default: boolean }>(sql`
    select c.relname as table, a.attname as column, format_type(a.atttypid, a.atttypmod) as type,
           a.attnotnull as not_null, (ad.adbin is not null) as has_default
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
    where n.nspname = ${schema} and c.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped`)
  for (const c of columns) {
    facts.push({
      table: c.table,
      text: `column ${c.table}.${c.column} ${normType(c.type)}${c.not_null ? " not null" : ""}${c.has_default ? " with a default" : ""}`,
    })
  }

  const indexes = await rows<{ table: string; def: string; primary: boolean; columns: string[] }>(sql`
    select c.relname as table, pg_get_indexdef(i.indexrelid) as def, i.indisprimary as primary,
           array(select a.attname from unnest(i.indkey) with ordinality k(attnum, ord)
                 join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum order by k.ord) as columns
    from pg_index i join pg_class c on c.oid = i.indrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = ${schema}`)
  for (const i of indexes) {
    if (i.primary) {
      facts.push({ table: i.table, text: `primary key ${i.table} (${i.columns.join(", ")})` })
    } else {
      // `CREATE UNIQUE INDEX x ON s.t USING btree (c) WHERE ...` -> `index t: unique USING btree (c) WHERE ...`
      const unique = i.def.startsWith("CREATE UNIQUE ") ? "unique " : ""
      const body = unqualify(i.def.slice(i.def.indexOf(" USING ") + 1))
      facts.push({ table: i.table, text: `index ${i.table}: ${unique}${body}` })
    }
  }

  const constraints = await rows<{ table: string; type: string; def: string; to: string | null; on_delete: string; from: string[]; to_cols: string[] }>(sql`
    select c.relname as table, con.contype as type, pg_get_constraintdef(con.oid) as def,
           case when rn.nspname = ${schema} then rc.relname end as to, con.confdeltype as on_delete,
           array(select a.attname from unnest(con.conkey) with ordinality k(attnum, ord)
                 join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum order by k.ord) as from,
           array(select a.attname from unnest(con.confkey) with ordinality k(attnum, ord)
                 join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.attnum order by k.ord) as to_cols
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_class rc on rc.oid = con.confrelid
    left join pg_namespace rn on rn.oid = rc.relnamespace
    where n.nspname = ${schema} and con.contype in ('c', 'f')`)
  for (const con of constraints) {
    if (con.type === "c") {
      facts.push({ table: con.table, text: `check ${con.table}: ${unqualify(con.def)}` })
    } else if (con.to) {
      // Foreign keys into other schemas (Supabase's auth) are skipped.
      const onDelete = ON_DELETE[con.on_delete] ?? con.on_delete
      facts.push({
        table: con.table,
        text: `foreign key ${con.table} (${con.from.join(", ")}) → ${con.to}(${con.to_cols.join(", ")}) on delete ${onDelete}`,
      })
    }
  }

  const enumRows = await rows<{ name: string; values: string[] }>(sql`
    select t.typname as name, array_agg(e.enumlabel order by e.enumsortorder) as values
    from pg_type t join pg_enum e on e.enumtypid = t.oid join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = ${schema}
    group by t.typname`)
  const enums = new Set<string>()
  for (const e of enumRows) {
    if (only && !only.enums.has(e.name)) continue
    enums.add(e.name)
    facts.push({ text: `enum ${e.name} (${e.values.join(", ")})` })
  }

  return { tables, enums, facts: facts.filter((f) => !f.table || tables.has(f.table)) }
}

/**
 * Returns the differences between `public` and what `migrations` build, as
 * readable lines; empty means they match. Must run inside a transaction.
 */
export async function diffAgainstMigrations(trx: Transaction<unknown>, migrations: Migration[]): Promise<string[]> {
  await sql`savepoint schema_check`.execute(trx)
  let expected: Description
  let actual: Description
  try {
    // Unqualified names in the migrations resolve to the scratch schema first.
    // public and extensions stay on the path for PostGIS (Supabase installs it in extensions).
    await sql`create schema ${sql.id(SCRATCH_SCHEMA)}`.execute(trx)
    await sql`set local search_path = ${sql.id(SCRATCH_SCHEMA)}, public, extensions`.execute(trx)
    for (const migration of migrations) await migration.up(trx)

    expected = await describeSchema(trx, SCRATCH_SCHEMA)
    actual = await describeSchema(trx, "public", expected)
  } finally {
    // Also undoes the search_path change.
    await sql`rollback to savepoint schema_check`.execute(trx)
    await sql`release savepoint schema_check`.execute(trx)
  }

  const out: string[] = []
  const actualTexts = new Set(actual.facts.map((f) => f.text))
  const expectedTexts = new Set(expected.facts.map((f) => f.text))
  for (const f of expected.facts) {
    // A missing table is reported once, not once per column, index and constraint.
    if (f.table && !actual.tables.has(f.table)) continue
    if (!actualTexts.has(f.text)) out.push(`missing ${f.text}`)
  }
  for (const f of actual.facts) if (!expectedTexts.has(f.text)) out.push(`unexpected ${f.text}`)
  return out
}
