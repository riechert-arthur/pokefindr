/**
 * Fetches the US's card shops from OpenStreetMap's Overpass API (#397) and
 * writes the snapshot the import reads, src/data/osm_card_shops.json.
 *
 * Run by a person, and the snapshot is committed: deploys never call
 * Overpass, and every change to the data is a diff someone can review.
 *
 *   npm run db:fetch-osm-shops
 *   npm run db:fetch-osm-shops -- --dry-run      # fetch and compare with the snapshot; write nothing
 *   npm run db:fetch-osm-shops -- --out <file>
 *
 * One request for the whole US (about 1 MB). The public Overpass servers are
 * shared and say "at capacity" when busy, so a refusal is retried with a
 * growing wait. OVERPASS_URL points it at another server (or your own).
 *
 * The data is © OpenStreetMap contributors, under the ODbL; the snapshot
 * carries the credit, and the app shows it wherever these shops appear.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { compareShops, OSM_ATTRIBUTION, OSM_COPYRIGHT_URL, overpassQuery, selectShops, type OsmElement } from "@/lib/osm/card-shops"
import { regionAt } from "@/server/geo/regions"
import { ROOT_DIR } from "../db/env"
import { argValue } from "./args"
import { SNAPSHOT_FILE } from "./osm-snapshot"

const OVERPASS_URL = process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter"
const RETRIES = 4
const RETRY_STATUSES = new Set([429, 502, 503, 504])

async function overpass(query: string): Promise<OsmElement[]> {
  for (let attempt = 0; ; attempt++) {
    let res: Response
    try {
      res = await fetch(OVERPASS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "PokeFindr card shop import (github.com/riechert-arthur/pokefindr)" },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(360_000),
      })
    } catch (err) {
      // A dropped connection or a server that never answered: worth another try, like a busy answer.
      const cause = err instanceof Error && err.cause instanceof Error ? `: ${err.cause.message}` : ""
      if (attempt >= RETRIES) throw new Error(`Couldn't reach Overpass${cause}`)
      await retryLater(attempt, `couldn't connect${cause}`)
      continue
    }
    if (res.ok) {
      const body = (await res.json()) as { elements?: OsmElement[]; remark?: string }
      // Overpass answers 200 with a remark when the query itself timed out.
      if (body.remark) throw new Error(`Overpass: ${body.remark}`)
      return body.elements ?? []
    }
    if (!RETRY_STATUSES.has(res.status) || attempt >= RETRIES) throw new Error(`Overpass answered ${res.status}: ${(await res.text()).slice(0, 300)}`)
    await retryLater(attempt, `busy (${res.status})`)
  }
}

async function retryLater(attempt: number, why: string) {
  const wait = 30_000 * 2 ** attempt
  console.log(`Overpass: ${why}; trying again in ${wait / 1000} s.`)
  await new Promise((r) => setTimeout(r, wait))
}

/** Pretty JSON, but one shop per line, so a new snapshot's diff shows each shop that changed. */
export function formatSnapshot({ shops, ...head }: { shops: unknown[] } & Record<string, unknown>): string {
  const top = JSON.stringify(head, null, 2).replace(/\n}$/, "")
  return `${top},\n  "shops": [\n${shops.map((s) => `    ${JSON.stringify(s)}`).join(",\n")}\n  ]\n}\n`
}

async function main() {
  const outArg = argValue("--out")
  const out = outArg ? path.resolve(outArg) : SNAPSHOT_FILE
  const dryRun = process.argv.includes("--dry-run")
  const query = overpassQuery()
  console.log(`Asking ${OVERPASS_URL} for the US's card shops…`)
  const elements = await overpass(query)
  const { shops, dropped } = selectShops(elements, (lng, lat) => regionAt(lng, lat)?.region ?? null)
  const snapshot = {
    source: "OpenStreetMap",
    attribution: OSM_ATTRIBUTION,
    license: `Open Database License (ODbL) 1.0, ${OSM_COPYRIGHT_URL}`,
    fetchedAt: new Date().toISOString(),
    overpass: OVERPASS_URL,
    query,
    counts: { elements: elements.length, shops: shops.length, coinOrStamp: dropped.coinOrStamp.length, unusable: dropped.unusable.length, duplicates: dropped.duplicates.length },
    dropped,
    shops,
  }
  console.log(`${elements.length} places: ${shops.length} shops; left out ${dropped.coinOrStamp.length} coin or stamp dealers, ${dropped.duplicates.length} mapped twice and ${dropped.unusable.length} without a name or position.`)
  if (existsSync(out)) {
    const { added, removed, changed } = compareShops((JSON.parse(readFileSync(out, "utf8")) as { shops: { externalId: string }[] }).shops, shops)
    const some = (ids: string[]) => (ids.length ? `: ${ids.slice(0, 10).join(", ")}${ids.length > 10 ? ", …" : ""}` : "")
    console.log(`Against ${path.relative(ROOT_DIR, out)}: ${added.length} added${some(added)}; ${removed.length} removed${some(removed)}; ${changed.length} changed${some(changed)}.`)
  }
  if (dryRun) {
    console.log("Dry run: nothing written. Re-run without --dry-run to write the snapshot.")
    return
  }
  writeFileSync(out, formatSnapshot(snapshot))
  console.log(`Wrote ${path.relative(ROOT_DIR, out)}.`)
}

if (process.argv[1]?.endsWith("fetch-osm-shops.ts")) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
