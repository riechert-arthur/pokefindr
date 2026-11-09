/**
 * The vending duplicate check (#154): locations.address_normalized, filled
 * by Postgres from the address with normalize_address() (the same rules as
 * normalizeAddress() in src/lib/locations/address.ts), so every writer (the
 * import, approvals, the admin form) keeps it current. Indexed with the
 * state for vending machines, which is what the check looks up.
 *
 * Machine IDs are already unique (locations_machine_id_key).
 */
import { sql, type Kysely } from "kysely"

type Db = Kysely<unknown>

export async function up(db: Db): Promise<void> {
  await sql`
    create function normalize_address(address text) returns text
    language plpgsql immutable parallel safe as $$
    declare
      s text := lower(coalesce(address, ''));
      words text[][] := array[['avenue', 'ave'], ['street', 'st'], ['road', 'rd'], ['drive', 'dr'], ['boulevard', 'blvd'], ['lane', 'ln'], ['court', 'ct'], ['place', 'pl'], ['parkway', 'pkwy'], ['highway', 'hwy'], ['circle', 'cir'], ['terrace', 'ter'], ['square', 'sq'], ['trail', 'trl'], ['expressway', 'expy'], ['freeway', 'fwy'], ['center', 'ctr'], ['suite', 'ste'], ['northeast', 'ne'], ['northwest', 'nw'], ['southeast', 'se'], ['southwest', 'sw'], ['north', 'n'], ['south', 's'], ['east', 'e'], ['west', 'w']];
    begin
      s := replace(s, '.', '');
      s := regexp_replace(s, '[^a-z0-9 ]+', ' ', 'g');
      for i in 1 .. array_length(words, 1) loop
        s := regexp_replace(s, '\\m' || words[i][1] || '\\M', words[i][2], 'g');
      end loop;
      s := btrim(regexp_replace(s, '\\s+', ' ', 'g'));
      return nullif(s, '');
    end
    $$
  `.execute(db)
  await sql`alter table locations add column address_normalized text generated always as (normalize_address(address)) stored`.execute(db)
  await sql`create index locations_vending_address_idx on locations (state, address_normalized) where kind = 'vending'`.execute(db)
}

export async function down(db: Db): Promise<void> {
  await sql`drop index locations_vending_address_idx`.execute(db)
  await sql`alter table locations drop column address_normalized`.execute(db)
  await sql`drop function normalize_address(text)`.execute(db)
}
