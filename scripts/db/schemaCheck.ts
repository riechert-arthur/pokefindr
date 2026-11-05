/**
 * Compares a live database's `public` schema with a drizzle-kit snapshot
 * (`drizzle/meta/XXXX_snapshot.json`).
 *
 * Used by `db:baseline` to refuse recording the baseline on a database that
 * doesn't match it. Checks every modelled table for columns (type, nullability,
 * whether it has a default), primary keys, indexes, foreign keys, check
 * constraints and enums. Index and constraint names are ignored, because
 * Postgres and Supabase name them differently; what they cover is compared.
 *
 * Indexes and check constraints are compared by their full definitions as
 * Postgres prints them (pg_get_indexdef / pg_get_constraintdef), so partial
 * predicates, expressions, operator classes, sort order and check bodies all
 * count. The expected side is printed the same way: the snapshot's indexes and
 * checks are created on temporary copies of each table inside a rolled-back
 * transaction (or savepoint), so Postgres normalizes both sides identically.
 *
 * Deliberately not compared: tables the schema doesn't model (e.g. the legacy
 * "Vending Machine Locations"), views, row-level security, foreign keys into
 * other schemas (Supabase's `auth`), and default expressions (only whether a
 * default exists, since `gen_random_uuid()` vs `uuid_generate_v4()` both work).
 */
import type { Sql, TransactionSql } from "postgres"

interface SnapshotColumn {
  name: string
  type: string
  primaryKey: boolean
  notNull: boolean
  default?: unknown
}

interface SnapshotIndex {
  columns: { expression: string; isExpression: boolean; asc: boolean; nulls?: string; opclass?: string }[]
  isUnique: boolean
  method: string
  where?: string
  with?: Record<string, unknown>
}

interface SnapshotTable {
  name: string
  columns: Record<string, SnapshotColumn>
  indexes: Record<string, SnapshotIndex>
  foreignKeys: Record<string, { columnsFrom: string[]; tableTo: string; columnsTo: string[]; onDelete?: string }>
  compositePrimaryKeys: Record<string, { columns: string[] }>
  uniqueConstraints: Record<string, { columns: string[]; nullsNotDistinct?: boolean }>
  checkConstraints: Record<string, { name: string; value: string }>
}

export interface Snapshot {
  tables: Record<string, SnapshotTable>
  enums: Record<string, { name: string; values: string[] }>
}

const ON_DELETE: Record<string, string> = {
  a: "no action",
  r: "restrict",
  c: "cascade",
  n: "set null",
  d: "set default",
}

// format_type() schema-qualifies types whose schema isn't on search_path
// (public.location_status, extensions.geography(...)), so drop any schema prefix.
const normType = (t: string) =>
  t.toLowerCase().replace(/\s+/g, "").replace(/^(?:"(?:[^"]|"")+"|[a-z_][a-z0-9_$]*)\./, "")

const quoteIdent = (id: string) => `"${id.replace(/"/g, '""')}"`

/**
 * Turns pg_get_indexdef output into a name-independent key:
 * `CREATE UNIQUE INDEX x ON public.t USING btree (c) WHERE ...` -> `t: unique USING btree (c) WHERE ...`
 */
const indexKey = (table: string, def: string) =>
  `${table}: ${def.startsWith("CREATE UNIQUE ") ? "unique " : ""}${def.slice(def.indexOf(" USING ") + 1)}`

/** drizzle-kit qualifies columns with the table name, which the temp copy doesn't have. */
const unqualify = (table: string, expr: string) => expr.split(`${quoteIdent(table)}.`).join("")

function createIndexSql(table: string, scratch: string, idx: SnapshotIndex) {
  const cols = idx.columns.map((c) => {
    let col = c.isExpression ? `(${unqualify(table, c.expression)})` : quoteIdent(c.expression)
    if (c.opclass) col += ` ${c.opclass}`
    if (!c.asc) col += " desc"
    // Only spell out NULLS when it differs from the default for the sort direction.
    const defaultNulls = c.asc ? "last" : "first"
    if (c.nulls && c.nulls !== defaultNulls) col += ` nulls ${c.nulls}`
    return col
  })
  const withOpts = Object.entries(idx.with ?? {})
  return (
    `create ${idx.isUnique ? "unique " : ""}index on ${scratch} using ${idx.method} (${cols.join(", ")})` +
    (withOpts.length ? ` with (${withOpts.map(([k, v]) => `${k} = ${v}`).join(", ")})` : "") +
    (idx.where ? ` where ${unqualify(table, idx.where)}` : "")
  )
}

class Rollback extends Error {}

/** Runs `fn` in a transaction (or a savepoint, if already in one) that is always rolled back. */
async function rolledBack<T>(sql: Sql | TransactionSql, fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
  let result: T | undefined
  const run = async (tx: TransactionSql) => {
    result = await fn(tx)
    throw new Rollback()
  }
  try {
    if ("savepoint" in sql) await sql.savepoint(run)
    else await sql.begin(run)
  } catch (err) {
    if (!(err instanceof Rollback)) throw err
  }
  return result as T
}

/**
 * Prints the snapshot's indexes and check constraints the way Postgres would,
 * by creating them on temporary copies of the real tables and rolling back.
 */
async function expectedDefinitions(sql: Sql | TransactionSql, tables: SnapshotTable[]) {
  return rolledBack(sql, async (tx) => {
    const indexes = new Set<string>()
    const checks = new Set<string>()
    for (const [i, table] of tables.entries()) {
      const scratch = `_schema_check_${i}`
      await tx.unsafe(`create temp table ${scratch} (like public.${quoteIdent(table.name)}) on commit drop`)

      // If an object can't be built (e.g. its column is missing, which is reported
      // separately), expect it under its SQL so it shows up as missing.
      const tryCreate = async (statement: string, onFailure: Set<string>) => {
        try {
          await tx.savepoint((sp) => sp.unsafe(statement))
        } catch {
          onFailure.add(`${table.name}: ${statement.replace(` ${scratch} `, ` ${table.name} `)}`)
        }
      }
      for (const idx of Object.values(table.indexes)) await tryCreate(createIndexSql(table.name, scratch, idx), indexes)
      for (const uc of Object.values(table.uniqueConstraints)) {
        await tryCreate(
          `create unique index on ${scratch} (${uc.columns.map(quoteIdent).join(", ")})` +
            (uc.nullsNotDistinct ? " nulls not distinct" : ""),
          indexes,
        )
      }
      for (const ck of Object.values(table.checkConstraints)) {
        await tryCreate(`alter table ${scratch} add check (${unqualify(table.name, ck.value)})`, checks)
      }

      const idxDefs = await tx<{ def: string }[]>`
        select pg_get_indexdef(i.indexrelid) as def from pg_index i
        where i.indrelid = ${`pg_temp.${scratch}`}::regclass`
      for (const { def } of idxDefs) indexes.add(indexKey(table.name, def))
      const checkDefs = await tx<{ def: string }[]>`
        select pg_get_constraintdef(oid) as def from pg_constraint
        where conrelid = ${`pg_temp.${scratch}`}::regclass and contype = 'c'`
      for (const { def } of checkDefs) checks.add(`${table.name}: ${def}`)
    }
    return { indexes, checks }
  })
}

const fkKey = (table: string, from: string[], to: string, toCols: string[], onDelete: string) =>
  `${table}: foreign key (${from.join(", ")}) → ${to}(${toCols.join(", ")}) on delete ${onDelete}`

function compareSets(label: string, expected: Set<string>, actual: Set<string>, out: string[]) {
  for (const key of expected) if (!actual.has(key)) out.push(`missing ${label} ${key}`)
  for (const key of actual) if (!expected.has(key)) out.push(`unexpected ${label} ${key}`)
}

/** Returns a list of human-readable differences; empty means the database matches. */
export async function diffAgainstSnapshot(sql: Sql | TransactionSql, snapshot: Snapshot): Promise<string[]> {
  const out: string[] = []
  const tables = Object.values(snapshot.tables)
  const tableNames = tables.map((t) => t.name)

  // Tables
  const existing = await sql<{ name: string }[]>`
    select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relname = any(${tableNames})`
  const existingNames = new Set(existing.map((r) => r.name))
  for (const name of tableNames) if (!existingNames.has(name)) out.push(`missing table ${name}`)

  // Columns
  const columns = await sql<{ table: string; column: string; type: string; not_null: boolean; has_default: boolean }[]>`
    select c.relname as table, a.attname as column, format_type(a.atttypid, a.atttypmod) as type,
           a.attnotnull as not_null, (ad.adbin is not null) as has_default
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
    where n.nspname = 'public' and c.relname = any(${tableNames}) and a.attnum > 0 and not a.attisdropped`
  const actualColumns = new Map(columns.map((c) => [`${c.table}.${c.column}`, c]))

  for (const table of tables) {
    if (!existingNames.has(table.name)) continue
    for (const col of Object.values(table.columns)) {
      const key = `${table.name}.${col.name}`
      const actual = actualColumns.get(key)
      if (!actual) {
        out.push(`missing column ${key} (${col.type})`)
        continue
      }
      if (normType(actual.type) !== normType(col.type)) {
        out.push(`column ${key} is ${actual.type}, expected ${col.type}`)
      }
      if (actual.not_null !== col.notNull) {
        out.push(`column ${key} is ${actual.not_null ? "NOT NULL" : "nullable"}, expected ${col.notNull ? "NOT NULL" : "nullable"}`)
      }
      const expectDefault = col.default !== undefined
      if (actual.has_default !== expectDefault) {
        out.push(`column ${key} ${actual.has_default ? "has a default" : "has no default"}, expected ${expectDefault ? "one" : "none"}`)
      }
      actualColumns.delete(key)
    }
  }
  for (const key of actualColumns.keys()) out.push(`unexpected column ${key}`)

  // Primary keys
  const pks = await sql<{ table: string; columns: string[] }[]>`
    select c.relname as table,
           array(select a.attname from unnest(i.indkey) with ordinality k(attnum, ord)
                 join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum order by k.ord) as columns
    from pg_index i join pg_class c on c.oid = i.indrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = any(${tableNames}) and i.indisprimary`
  const expectedPks = new Set<string>()
  for (const table of tables) {
    const cols = Object.values(table.columns).filter((c) => c.primaryKey).map((c) => c.name)
    for (const pk of Object.values(table.compositePrimaryKeys)) cols.push(...pk.columns)
    if (cols.length) expectedPks.add(`${table.name}: (${cols.join(", ")})`)
  }
  compareSets("primary key", expectedPks, new Set(pks.map((p) => `${p.table}: (${p.columns.join(", ")})`)), out)

  // Indexes (excluding primary keys) and check constraints, by full definition
  const expected = await expectedDefinitions(
    sql,
    tables.filter((t) => existingNames.has(t.name)),
  )
  const indexes = await sql<{ table: string; def: string }[]>`
    select c.relname as table, pg_get_indexdef(i.indexrelid) as def
    from pg_index i
    join pg_class c on c.oid = i.indrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = any(${tableNames}) and not i.indisprimary`
  compareSets("index", expected.indexes, new Set(indexes.map((i) => indexKey(i.table, i.def))), out)

  // Foreign keys within public
  const fks = await sql<{ table: string; from: string[]; to: string; to_cols: string[]; on_delete: string }[]>`
    select c.relname as table, rc.relname as to, con.confdeltype as on_delete,
           array(select a.attname from unnest(con.conkey) with ordinality k(attnum, ord)
                 join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum order by k.ord) as from,
           array(select a.attname from unnest(con.confkey) with ordinality k(attnum, ord)
                 join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.attnum order by k.ord) as to_cols
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_class rc on rc.oid = con.confrelid
    join pg_namespace rn on rn.oid = rc.relnamespace
    where con.contype = 'f' and n.nspname = 'public' and rn.nspname = 'public' and c.relname = any(${tableNames})`
  const expectedFks = new Set<string>()
  for (const table of tables) {
    for (const fk of Object.values(table.foreignKeys)) {
      expectedFks.add(fkKey(table.name, fk.columnsFrom, fk.tableTo, fk.columnsTo, fk.onDelete ?? "no action"))
    }
  }
  compareSets(
    "foreign key",
    expectedFks,
    new Set(fks.map((f) => fkKey(f.table, f.from, f.to, f.to_cols, ON_DELETE[f.on_delete] ?? f.on_delete))),
    out,
  )

  const checks = await sql<{ table: string; def: string }[]>`
    select c.relname as table, pg_get_constraintdef(con.oid) as def
    from pg_constraint con join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace
    where con.contype = 'c' and n.nspname = 'public' and c.relname = any(${tableNames})`
  compareSets("check constraint", expected.checks, new Set(checks.map((c) => `${c.table}: ${c.def}`)), out)

  // Enums
  const enumNames = Object.values(snapshot.enums).map((e) => e.name)
  const enums = await sql<{ name: string; values: string[] }[]>`
    select t.typname as name, array_agg(e.enumlabel order by e.enumsortorder) as values
    from pg_type t join pg_enum e on e.enumtypid = t.oid join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = any(${enumNames})
    group by t.typname`
  for (const expected of Object.values(snapshot.enums)) {
    const actual = enums.find((e) => e.name === expected.name)
    if (!actual) out.push(`missing enum ${expected.name}`)
    else if (actual.values.join(",") !== expected.values.join(",")) {
      out.push(`enum ${expected.name} is (${actual.values.join(", ")}), expected (${expected.values.join(", ")})`)
    }
  }

  return out
}
