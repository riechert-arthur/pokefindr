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
 * Deliberately not compared: tables the schema doesn't model (e.g. the legacy
 * "Vending Machine Locations"), views, row-level security, foreign keys into
 * other schemas (Supabase's `auth`), and default expressions (only whether a
 * default exists, since `gen_random_uuid()` vs `uuid_generate_v4()` both work).
 */
import type { Sql } from "postgres"

interface SnapshotColumn {
  name: string
  type: string
  primaryKey: boolean
  notNull: boolean
  default?: unknown
}

interface SnapshotTable {
  name: string
  columns: Record<string, SnapshotColumn>
  indexes: Record<string, { columns: { expression: string }[]; isUnique: boolean; method: string }>
  foreignKeys: Record<string, { columnsFrom: string[]; tableTo: string; columnsTo: string[]; onDelete?: string }>
  compositePrimaryKeys: Record<string, { columns: string[] }>
  uniqueConstraints: Record<string, { columns: string[] }>
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

const normType = (t: string) => t.toLowerCase().replace(/\s+/g, "").replace(/^"public"\./, "")

const indexKey = (table: string, unique: boolean, method: string, columns: string[]) =>
  `${table}: ${unique ? "unique " : ""}${method} index on (${columns.join(", ")})`

const fkKey = (table: string, from: string[], to: string, toCols: string[], onDelete: string) =>
  `${table}: foreign key (${from.join(", ")}) → ${to}(${toCols.join(", ")}) on delete ${onDelete}`

function compareSets(label: string, expected: Set<string>, actual: Set<string>, out: string[]) {
  for (const key of expected) if (!actual.has(key)) out.push(`missing ${label} ${key}`)
  for (const key of actual) if (!expected.has(key)) out.push(`unexpected ${label} ${key}`)
}

/** Returns a list of human-readable differences; empty means the database matches. */
export async function diffAgainstSnapshot(sql: Sql, snapshot: Snapshot): Promise<string[]> {
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

  // Indexes (excluding primary keys), compared by table, uniqueness, method and columns
  const indexes = await sql<{ table: string; unique: boolean; method: string; columns: string[] }[]>`
    select c.relname as table, i.indisunique as unique, am.amname as method,
           array(select coalesce(a.attname, '<expression>') from unnest(i.indkey) with ordinality k(attnum, ord)
                 left join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum order by k.ord) as columns
    from pg_index i
    join pg_class c on c.oid = i.indrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_class ic on ic.oid = i.indexrelid
    join pg_am am on am.oid = ic.relam
    where n.nspname = 'public' and c.relname = any(${tableNames}) and not i.indisprimary`
  const expectedIndexes = new Set<string>()
  for (const table of tables) {
    for (const idx of Object.values(table.indexes)) {
      expectedIndexes.add(indexKey(table.name, idx.isUnique, idx.method, idx.columns.map((c) => c.expression)))
    }
    for (const uc of Object.values(table.uniqueConstraints)) {
      expectedIndexes.add(indexKey(table.name, true, "btree", uc.columns))
    }
  }
  compareSets("index", expectedIndexes, new Set(indexes.map((i) => indexKey(i.table, i.unique, i.method, i.columns))), out)

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

  // Check constraints: Postgres rewrites expressions (BETWEEN becomes >= AND <=),
  // so compare how many each table has and print the definitions on a mismatch.
  const checks = await sql<{ table: string; def: string }[]>`
    select c.relname as table, pg_get_constraintdef(con.oid) as def
    from pg_constraint con join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace
    where con.contype = 'c' and n.nspname = 'public' and c.relname = any(${tableNames})`
  for (const table of tables) {
    const expected = Object.values(table.checkConstraints)
    const actual = checks.filter((c) => c.table === table.name)
    if (existingNames.has(table.name) && expected.length !== actual.length) {
      out.push(
        `${table.name} has ${actual.length} check constraint(s) [${actual.map((c) => c.def).join("; ")}], ` +
          `expected ${expected.length} [${expected.map((c) => c.value).join("; ")}]`,
      )
    }
  }

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
